import { Controller, Post, Get, HttpCode, HttpStatus, Param, NotFoundException } from '@nestjs/common';
import { ProbeService } from './probe.service';
import type { StartProbeResponse, ProbeProgressResponse } from '@shared/api.interface';

@Controller('api/probe')
export class ProbeController {
  constructor(private readonly probeService: ProbeService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  startProbe(): StartProbeResponse {
    const taskId = this.probeService.startProbe();
    return { taskId };
  }

  @Get(':taskId')
  getProgress(@Param('taskId') taskId: string): ProbeProgressResponse {
    const progress = this.probeService.getProgress(taskId);
    if (!progress) {
      throw new NotFoundException('任务不存在或已过期');
    }
    return progress;
  }
}
