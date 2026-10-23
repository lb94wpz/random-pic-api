#!/usr/bin/env node
// 本地开发服务器：行为对齐 Cloudflare Pages
//   所有请求先交给 functions/[[default]].js
//   函数内部对静态路径调用 context.next()，由这里把静态文件吐回去
// 用法：node scripts/dev.mjs   或   PORT=3000 node scripts/dev.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FUNCTION_FILE = path.join(ROOT, 'functions', '[[default]].js');
const PORT = Number(process.env.PORT) || 8787;
// 默认监听 0.0.0.0：容器 / 云开发环境里用 127.0.0.1 会外部访问不到
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const { onRequest } = await import(pathToFileURL(FUNCTION_FILE).href);

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// 对应平台上的静态托管
async function serveStatic(request, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let filePath;
  try {
    filePath = path.resolve(ROOT, '.' + decodeURIComponent(pathname));
  } catch {
    return notFound();
  }

  // 阻止 ../ 穿越到项目目录之外
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return notFound();

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return notFound();
  }

  if (stat.isDirectory()) {
    if (!pathname.endsWith('/')) {
      return new Response(null, { status: 301, headers: { Location: pathname + '/' } });
    }
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch {
      return notFound();
    }
  }

  const body = request.method === 'HEAD' ? null : await fs.promises.readFile(filePath);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST + ':' + PORT));

  try {
    const request = new Request(url, { method: req.method, headers: req.headers });
    const response = await onRequest({
      request,
      env: process.env,
      next: () => serveStatic(request, url.pathname),
    });

    const body = Buffer.from(await response.arrayBuffer());

    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(body);

    console.log(
      req.method.padEnd(7),
      url.pathname + url.search,
      '->',
      response.status,
      response.headers.get('Location') || ''
    );
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('本地服务器错误');
  }
});

server.on('error', (error) => {
  console.error('启动失败:', error.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('随机图片 API 本地预览: http://localhost:' + PORT);
  console.log('监听地址: ' + HOST + ':' + PORT);
  console.log('接口示例: /random  /random?type=moe  /random?type=bd,lai  /random?return=json');

  if (!fs.existsSync(path.join(ROOT, 'functions', '_manifest.js'))) {
    console.warn('警告: 缺少 functions/_manifest.js，先执行 ./scripts/gen-manifest.sh');
  }
});
