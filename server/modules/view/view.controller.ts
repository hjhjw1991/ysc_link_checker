import { Controller, Get, Render, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller()
export class ViewController {

  @Get(['/', '*'])
  @Render('index')
  async render(@Req() req: Request): Promise<{ __platform__: string; appName?: string }> {
    // you can add custom render params here
    const platformData = req.__platform_data__ ?? {};
    return {
      // don't delete this line, it's used by client to get platform info
      __platform__: JSON.stringify(platformData),
      // 本地独立运行时平台拿不到应用名，页面标题会退化成「妙搭应用」；这里覆盖成真实名字。
      // 平台环境下不传，仍用 ViewContext 中间件注入的 appName。
      ...(process.env.LOCAL_STANDALONE === '1' ? { appName: '影视仓链接检测器' } : {}),
    };
  }
}
