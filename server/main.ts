import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createLocalAssetsMiddleware } from './common/middlewares/local-assets.middleware';
import { localStandaloneMiddleware } from './common/middlewares/local-standalone.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  // 必须早于 configureApp：框架的 ViewContext 中间件要读这个请求头算 basename
  app.use(localStandaloneMiddleware);
  await configureApp(app, { 
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  const clientDir = join(process.cwd(), 'dist/client');
  app.setBaseViewsDir(clientDir);
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  // 本地独立运行时没有 CDN，dist/client/assets 下的构建产物要由 NestJS 自己直出。
  // 平台部署时该目录不存在（产物在 CDN 上），中间件会全部 next()，行为不变。
  app.use(createLocalAssetsMiddleware(clientDir));

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
