// ============================================================
// 随机图片 API
// 兼容 Cloudflare Pages / EdgeOne Pages
//
// 路由：
//   /random        所有目录随机，按设备方向在横屏 / 竖屏目录中挑
//   /<目录名>      只在指定目录内随机，如 /ys、/ysmp（不看设备方向）
//
// 参数：
//   return=302|json        返回方式，默认 302 重定向
//   orientation=auto|h|v   仅 /random 有效，默认 auto（按 User-Agent 判断）
//
// 约定：
//   images/<名字>/1.webp        横屏目录
//   images/<名字>mp/1.webp      竖屏目录（mp = mobile portrait）
//   目录内文件名连续编号 1.webp ~ N.webp，N 记录在 images/manifest.json
// ============================================================

const IMAGE_ROOT = '/images';
const MANIFEST_PATH = '/images/manifest.json';
const IMAGE_EXT = '.webp';

const RANDOM_ROUTE = 'random';
const PORTRAIT_SUFFIX = 'mp';

const RETURN_REDIRECT = '302';
const RETURN_JSON = 'json';

const ORIENTATION_LANDSCAPE = 'h';
const ORIENTATION_PORTRAIT = 'v';
const ORIENTATION_AUTO = 'auto';

const MANIFEST_TTL = 5 * 60 * 1000;
const MANIFEST_ERROR_TTL = 30 * 1000;

const MOBILE_KEYWORDS = [
  'mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry',
  'windows phone', 'opera mini', 'iemobile', 'mobile safari',
  'webos', 'kindle', 'silk', 'fennec', 'maemo', 'tablet',
];

const ORIENTATION_ALIASES = new Map([
  ['h', ORIENTATION_LANDSCAPE],
  ['horizontal', ORIENTATION_LANDSCAPE],
  ['landscape', ORIENTATION_LANDSCAPE],
  ['v', ORIENTATION_PORTRAIT],
  ['vertical', ORIENTATION_PORTRAIT],
  ['portrait', ORIENTATION_PORTRAIT],
]);

// -------- 运行时配置（环境变量） --------
// ALLOWED_DOMAINS 为空 = 完全公开；ALLOW_EMPTY_REQUEST 控制是否放行无 Origin/Referer 的请求
let ALLOWED_DOMAINS = [];
let ALLOW_EMPTY_REQUEST = true;

// -------- manifest 内存缓存 --------
let folderManifest = null;
let manifestExpiresAt = 0;
let manifestLoading = null;

// ========================================
// 配置
// ========================================
function initConfig(env) {
  if (!env) return;

  if (env.ALLOWED_DOMAINS && typeof env.ALLOWED_DOMAINS === 'string') {
    ALLOWED_DOMAINS = env.ALLOWED_DOMAINS
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  if (env.ALLOW_EMPTY_REQUEST !== undefined) {
    ALLOW_EMPTY_REQUEST =
      env.ALLOW_EMPTY_REQUEST === true ||
      env.ALLOW_EMPTY_REQUEST === 'true' ||
      env.ALLOW_EMPTY_REQUEST === '1';
  }
}

function isPublicMode() {
  return ALLOWED_DOMAINS.length === 0;
}

// ========================================
// CORS / 防盗链
// ========================================
function extractDomain(urlString) {
  if (!urlString) return null;
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isDomainAllowed(domain) {
  if (!domain) return false;

  const lowerDomain = domain.toLowerCase();

  return ALLOWED_DOMAINS.some((allowed) => {
    const lowerAllowed = allowed.toLowerCase();
    return lowerDomain === lowerAllowed || lowerDomain.endsWith('.' + lowerAllowed);
  });
}

function checkAntiLeech(request) {
  const refererDomain = extractDomain(request.headers.get('Referer'));
  const origin = request.headers.get('Origin');
  const originDomain = extractDomain(origin);

  if (isPublicMode()) {
    return { allowed: true };
  }

  if (originDomain && isDomainAllowed(originDomain)) {
    return { allowed: true };
  }

  if (refererDomain && isDomainAllowed(refererDomain)) {
    return { allowed: true };
  }

  if (!origin && !refererDomain && ALLOW_EMPTY_REQUEST) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: '域名未授权 (Origin: ' + (originDomain || '无') + ', Referer: ' + (refererDomain || '无') + ')',
  };
}

function resolveCorsOrigin(request) {
  const origin = request.headers.get('Origin');

  if (isPublicMode()) {
    return origin || '*';
  }

  if (origin && isDomainAllowed(extractDomain(origin))) {
    return origin;
  }

  if (!origin && ALLOW_EMPTY_REQUEST) {
    return '*';
  }

  return null;
}

function handlePreflight(request) {
  const origin = request.headers.get('Origin');

  if (!isPublicMode() && (!origin || !isDomainAllowed(extractDomain(origin)))) {
    return textResponse('CORS 未授权', 403, null);
  }

  const allowOrigin = origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  if (allowOrigin !== '*') {
    headers['Vary'] = 'Origin';
  }

  return new Response(null, { status: 204, headers });
}

function buildHeaders(corsOrigin, extra = {}) {
  const headers = new Headers(extra);

  if (corsOrigin) {
    headers.set('Access-Control-Allow-Origin', corsOrigin);
    if (corsOrigin !== '*') {
      headers.set('Vary', 'Origin');
    }
  }

  return headers;
}

function jsonResponse(body, status, corsOrigin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildHeaders(corsOrigin, {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

function textResponse(text, status, corsOrigin, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: buildHeaders(corsOrigin, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

// ========================================
// 目录清单
// images/manifest.json 形如 { "ys": 23, "ysmp": 37 }
// 由 scripts/gen-manifest.sh 扫描 images/ 生成
// ========================================
function normalizeManifest(data) {
  const folders = {};

  for (const [name, count] of Object.entries(data || {})) {
    const total = Number(count);
    if (Number.isInteger(total) && total > 0) {
      folders[name] = total;
    }
  }

  return folders;
}

async function loadManifest(request) {
  const now = Date.now();

  if (folderManifest && now < manifestExpiresAt) {
    return folderManifest;
  }

  if (manifestLoading) {
    return manifestLoading;
  }

  manifestLoading = (async () => {
    try {
      const resp = await fetch(new URL(MANIFEST_PATH, request.url).toString());

      if (!resp.ok) {
        throw new Error('manifest HTTP ' + resp.status);
      }

      folderManifest = normalizeManifest(await resp.json());
      manifestExpiresAt = Date.now() + MANIFEST_TTL;
    } catch (error) {
      console.error('加载 manifest 失败:', error);
      folderManifest = {};
      manifestExpiresAt = Date.now() + MANIFEST_ERROR_TTL;
    } finally {
      manifestLoading = null;
    }

    return folderManifest;
  })();

  return manifestLoading;
}

// ========================================
// 参数解析
// ========================================
function parseRouteName(url) {
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length !== 1) return null;

  try {
    return decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
}

function parseReturnType(raw) {
  if (raw === null || raw === '') return RETURN_REDIRECT;

  const value = raw.trim().toLowerCase();

  if (value === RETURN_JSON) return RETURN_JSON;
  if (value === RETURN_REDIRECT) return RETURN_REDIRECT;

  return null;
}

function parseOrientation(raw) {
  if (raw === null || raw === '') return ORIENTATION_AUTO;

  const value = raw.trim().toLowerCase();

  if (value === ORIENTATION_AUTO) return ORIENTATION_AUTO;

  return ORIENTATION_ALIASES.get(value) || null;
}

function isMobileDevice(userAgent) {
  if (!userAgent) return false;

  const ua = userAgent.toLowerCase();
  return MOBILE_KEYWORDS.some((keyword) => ua.includes(keyword));
}

function detectOrientation(request) {
  return isMobileDevice(request.headers.get('User-Agent'))
    ? ORIENTATION_PORTRAIT
    : ORIENTATION_LANDSCAPE;
}

// ========================================
// 目录选择
// ========================================
function isPortraitFolder(name) {
  return name.endsWith(PORTRAIT_SUFFIX);
}

// /random：该方向的全部目录（横屏=不带 mp，竖屏=带 mp）
function foldersForRandom(orientation, folders) {
  const all = Object.keys(folders);
  const wantPortrait = orientation === ORIENTATION_PORTRAIT;
  const matched = all.filter((name) => isPortraitFolder(name) === wantPortrait);

  // 该方向没有目录时退回全部，避免空结果
  return matched.length > 0 ? matched : all;
}

// ========================================
// 随机取图
// ========================================
function randomInt(max) {
  return Math.floor(Math.random() * max) + 1;
}

function pickImage(folders, names) {
  const total = names.reduce((sum, name) => sum + folders[name], 0);

  if (total <= 0) return null;

  let index = Math.floor(Math.random() * total);

  for (const name of names) {
    if (index < folders[name]) {
      return { folder: name, file: randomInt(folders[name]) };
    }
    index -= folders[name];
  }

  return null;
}

// ========================================
// 请求处理
// ========================================
async function handleRequest(request, env) {
  initConfig(env);

  let corsOrigin = null;

  try {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return handlePreflight(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('只支持 GET / HEAD', 405, null, {
        Allow: 'GET, HEAD, OPTIONS',
      });
    }

    const leech = checkAntiLeech(request);
    if (!leech.allowed) {
      return jsonResponse({ error: leech.reason }, 403, null);
    }

    corsOrigin = resolveCorsOrigin(request);

    const name = parseRouteName(url);
    if (name === null) {
      return textResponse('接口不存在', 404, corsOrigin);
    }

    const returnType = parseReturnType(url.searchParams.get('return'));
    if (returnType === null) {
      return textResponse('return 只支持 302 或 json', 400, corsOrigin);
    }

    const folders = await loadManifest(request);
    if (Object.keys(folders).length === 0) {
      return textResponse('图片清单不可用', 503, corsOrigin);
    }

    // /random 按设备方向挑目录并支持 orientation 参数
    // /<目录名> 只在该目录里随机，不看设备方向
    let targetFolders;

    if (name === RANDOM_ROUTE) {
      const orientationParam = parseOrientation(url.searchParams.get('orientation'));
      if (orientationParam === null) {
        return textResponse('orientation 只支持 auto / h / v', 400, corsOrigin);
      }

      const orientation =
        orientationParam === ORIENTATION_AUTO ? detectOrientation(request) : orientationParam;

      targetFolders = foldersForRandom(orientation, folders);
    } else {
      if (folders[name] === undefined) {
        return textResponse('目录不存在', 404, corsOrigin);
      }
      targetFolders = [name];
    }

    const picked = pickImage(folders, targetFolders);
    if (!picked) {
      return textResponse('没有图片', 404, corsOrigin);
    }

    const imagePath = IMAGE_ROOT + '/' + picked.folder + '/' + picked.file + IMAGE_EXT;

    if (returnType === RETURN_JSON) {
      return jsonResponse(
        { url: new URL(imagePath, url.origin).toString() },
        200,
        corsOrigin,
        { 'Cache-Control': 'no-store' }
      );
    }

    return new Response(null, {
      status: 302,
      headers: buildHeaders(corsOrigin, {
        Location: imagePath,
        'Cache-Control': 'no-store',
      }),
    });
  } catch (error) {
    console.error('请求失败:', error);
    return textResponse('服务器内部错误', 500, corsOrigin);
  }
}

// ========================================
// 双平台入口
// ========================================

// 标准 Pages Functions 入口（Cloudflare + EdgeOne）
export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

// EdgeOne Edge Functions / Workers 风格兜底入口
export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
