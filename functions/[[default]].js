// ============================================================
// 随机图片 API
// 兼容 Cloudflare Pages / EdgeOne Pages
//
// 路由：
//   /random               所有目录随机，按设备方向在横屏 / 竖屏目录中挑
//
// 参数：
//   type=目录[,目录]      指定目录，可多选，如 ?type=bd、?type=bd,lai
//                         不传 = 全部目录（按设备方向筛选）
//   return=302|json        返回方式，默认 302 重定向
//   orientation=auto|h|v   仅在没传 type 时有效，默认 auto（按 User-Agent 判断）
//
// 约定：
//   images/<名字>/        横屏目录
//   images/<名字>mp/      竖屏目录（mp = mobile portrait）
//   目录下的 .webp 文件名不限，清单记录在 functions/_manifest.js（脚本生成）
// ============================================================

import manifestData from './_manifest.js';

const IMAGE_ROOT = '/images';

const STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.css', '.json', '.webp', '.png', '.jpg',
  '.jpeg', '.svg', '.ico', '.txt', '.xml', '.map', '.woff', '.woff2',
]);

const API_PATH = '/random';
const PORTRAIT_SUFFIX = 'mp';

const RETURN_REDIRECT = '302';
const RETURN_JSON = 'json';

const ORIENTATION_LANDSCAPE = 'h';
const ORIENTATION_PORTRAIT = 'v';
const ORIENTATION_AUTO = 'auto';

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

// -------- 目录清单（构建时打包进函数，无需运行时 fetch） --------
const FOLDER_COUNTS = normalizeManifest(manifestData);

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
// functions/_manifest.js 形如 { "moe": ["1.webp", ...], "moemp": [...] }
// 由 scripts/gen-manifest.sh 扫描 images/ 生成
// ========================================
function normalizeManifest(data) {
  const folders = {};

  for (const [name, files] of Object.entries(data || {})) {
    if (Array.isArray(files) && files.length > 0) {
      folders[name] = files;
    }
  }

  return folders;
}

// ========================================
// 参数解析
// ========================================
// ?type=bd,lai -> ['bd', 'lai']；未传 -> null；传了空值 -> []
function parseTypeParam(raw) {
  if (raw === null) return null;

  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return [...new Set(names)];
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
function pickImage(folders, names) {
  // 按文件数加权：目录里图越多，被选中的概率越大
  const total = names.reduce((sum, name) => sum + folders[name].length, 0);

  if (total <= 0) return null;

  let index = Math.floor(Math.random() * total);

  for (const name of names) {
    const files = folders[name];

    if (index < files.length) {
      return { folder: name, file: files[index] };
    }

    index -= files.length;
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

    // 只有 /random 是接口，其他路径（/、/images/... 等静态资源除外）都是 404
    if (url.pathname !== API_PATH) {
      return textResponse('接口不存在', 404, corsOrigin);
    }

    const returnType = parseReturnType(url.searchParams.get('return'));
    if (returnType === null) {
      return textResponse('return 只支持 302 或 json', 400, corsOrigin);
    }

    const folders = FOLDER_COUNTS;
    if (Object.keys(folders).length === 0) {
      return textResponse('图片清单为空，请先执行 ./scripts/gen-manifest.sh 并重新部署', 503, corsOrigin);
    }

    // ?info：返回每个目录的图片数量，供首页卡片展示（如 111P）
    if (url.searchParams.has('info')) {
      const counts = {};

      for (const [dir, files] of Object.entries(folders)) {
        counts[dir] = files.length;
      }

      return jsonResponse(counts, 200, corsOrigin, { 'Cache-Control': 'no-store' });
    }

    // type 指定目录：传几个就在几个目录里随机（不看设备方向）
    // 没传 type：按设备方向在所有横屏 / 竖屏目录里随机
    const typeNames = parseTypeParam(url.searchParams.get('type'));

    if (typeNames !== null && typeNames.length === 0) {
      return textResponse('type 不能为空，格式如 ?type=bd 或 ?type=bd,lai', 400, corsOrigin);
    }

    let targetFolders;

    if (typeNames !== null) {
      const unknown = typeNames.filter((name) => folders[name] === undefined);

      if (unknown.length > 0) {
        return textResponse('目录不存在: ' + unknown.join(', '), 404, corsOrigin);
      }

      targetFolders = typeNames;
    } else {
      const orientationParam = parseOrientation(url.searchParams.get('orientation'));
      if (orientationParam === null) {
        return textResponse('orientation 只支持 auto / h / v', 400, corsOrigin);
      }

      const orientation =
        orientationParam === ORIENTATION_AUTO ? detectOrientation(request) : orientationParam;

      targetFolders = foldersForRandom(orientation, folders);
    }

    const picked = pickImage(folders, targetFolders);
    if (!picked) {
      return textResponse('没有图片', 404, corsOrigin);
    }

    const imagePath = IMAGE_ROOT + '/' + picked.folder + '/' + encodeURIComponent(picked.file);

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

// 这个函数是 catch-all，平台会把**所有**请求都交给它，包括 /images/** 静态图片。
// 静态资源必须用 context.next() 交还给静态托管，否则图片会 404。
function isStaticPath(pathname) {
  // 首页、目录页和带后缀的文件交给静态托管；/random 不带后缀，会走接口
  if (pathname === '/' || pathname === '') return true;
  if (pathname.startsWith(IMAGE_ROOT + '/')) return true;
  if (pathname.endsWith('/')) return true;

  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');

  return dot > 0 && STATIC_EXTENSIONS.has(last.slice(dot).toLowerCase());
}

// 标准 Pages Functions 入口（Cloudflare + EdgeOne）
export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);

  if (isStaticPath(pathname) && typeof context.next === 'function') {
    return context.next();
  }

  return handleRequest(context.request, context.env);
}

// EdgeOne Edge Functions / Workers 风格兜底入口
export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
