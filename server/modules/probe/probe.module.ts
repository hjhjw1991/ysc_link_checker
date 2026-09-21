import { Module } from '@nestjs/common';
import { ProbeController } from './probe.controller';
import { ProbeService } from './probe.service';

@Module({
  controllers: [ProbeController],
  providers: [ProbeService],
})
export class ProbeModule {}
