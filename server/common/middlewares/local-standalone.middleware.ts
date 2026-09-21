import type { NextFunction, Request, Response } from 'express';

/**
 * 本地独立运行时，伪装成「自定义域名」入口。
 *
 * 框架按请求头决定前端 BrowserRouter 的 basename：带 `x-miaoda-tenant-host` → `/app/<appId>`，
 * 带 `x-miaoda-custom-host` → `/`，两者都没有时退化成 `/app/`（appId 为空）。本地没有网关注入
 * 这些头，页面就会拿到 basename="/app/"，而浏览器地址是 "/"，react-router 直接
 * "won't render anything" —— 表现为一片空白。
 *
 * 这里在本地模式下补一个 `x-miaoda-custom-host`，让 basename 回到 `/`。
 * 只在 LOCAL_STANDALONE=1 时生效，平台环境不受影响。
 */
export function localStandaloneMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.LOCAL_STANDALONE === '1') {
    if (
      req.headers['x-miaoda-tenant-host'] === undefined &&
      req.headers['x-miaoda-custom-host'] === undefined
    ) {
      req.headers['x-miaoda-custom-host'] = String(req.headers.host ?? 'localhost');
    }
  }
  next();
}
