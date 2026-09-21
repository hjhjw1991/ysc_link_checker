import { Module } from '@nestjs/common';

import { SourcesModule } from '../sources/sources.module';
import { ProbeController } from './probe.controller';
import { ProbeService } from './probe.service';

@Module({
  imports: [SourcesModule],
  controllers: [ProbeController],
  providers: [ProbeService],
})
export class ProbeModule {}
