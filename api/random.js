// Vercel 适配层：vercel.json 把 /random 重写到 /api/random，这里再交回 Pages Functions 的实现，
// 这样 Cloudflare Pages / EdgeOne Pages / Vercel 三家用的是同一份接口逻辑。
// 运行在 Vercel Edge Runtime（Web 标准的 Request / Response，与 Pages Functions 一致）。
import { handleRequest } from '../functions/[[default]].js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  const url = new URL(request.url);
  url.pathname = '/random';

  const env = {
    ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
    ALLOW_EMPTY_REQUEST: process.env.ALLOW_EMPTY_REQUEST,
  };

  return handleRequest(new Request(url, request), env);
}
