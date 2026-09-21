import { Module } from '@nestjs/common';

import { CustomSourceStore, DEFAULT_STORE_FILE } from './custom-source-store';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  controllers: [SourcesController],
  providers: [
    {
      provide: CustomSourceStore,
      // 存储位置可用 CUSTOM_SOURCES_FILE 覆盖，方便部署到只读目录以外的地方
      useFactory: () => new CustomSourceStore(process.env.CUSTOM_SOURCES_FILE || DEFAULT_STORE_FILE),
    },
    SourcesService,
  ],
  exports: [SourcesService],
})
export class SourcesModule {}
