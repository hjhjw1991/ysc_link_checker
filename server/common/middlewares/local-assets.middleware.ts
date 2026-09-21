import { createReadStream, statSync } from 'fs';
import { extname, join, normalize, sep } from 'path';

import type { NextFunction, Request, Response } from 'express';

/**
 * 本地直出前端构建产物（dist/client/assets/*）。
 *
 * 平台部署时这些带 hash 的产物由 CDN 提供，框架自带的 publicAssetsMiddleware 明确跳过
 * `assets/` 前缀；本地没有 CDN，请求就会落到 ViewController 的 `@Get('*')` 上、拿到一份
 * HTML，浏览器随即报 "Expected a JavaScript-or-Wasm module script ... MIME type text/html"，
 * 页面白屏。这里把这段缺口补上：只处理 /assets/**，命中就直出，未命中一律 next()。
 */
const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

export function createLocalAssetsMiddleware(clientDir: string) {
  const assetsDir = join(clientDir, 'assets');

  return function localAssetsMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const match = /^\/assets\/(.+)$/.exec(req.path);
    if (!match) return next();

    // 防目录穿越：解析后必须仍在 assets 目录内
    const filePath = normalize(join(assetsDir, decodeURIComponent(match[1])));
    if (!filePath.startsWith(assetsDir + sep)) return next();

    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return next();
    }
    if (!stat.isFile()) return next();

    res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    // 文件名带内容 hash，可长缓存
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  };
}
