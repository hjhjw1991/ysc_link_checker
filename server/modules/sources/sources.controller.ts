import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

import type { ImportSourcesResponse, ListSourcesResponse } from '@shared/api.interface';

import { SourcesService } from './sources.service';

/** 单次导入的文本上限，够贴几百条链接，同时挡住误粘贴整个文件 */
const MAX_IMPORT_TEXT_LENGTH = 200_000;

@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  list(): ListSourcesResponse {
    return this.sourcesService.listAll();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  import(@Body('text') text: unknown): ImportSourcesResponse {
    if (typeof text !== 'string') {
      throw new BadRequestException('text 必须是字符串');
    }
    if (text.length > MAX_IMPORT_TEXT_LENGTH) {
      throw new BadRequestException(`导入内容过长，请控制在 ${MAX_IMPORT_TEXT_LENGTH} 字符以内`);
    }
    return this.sourcesService.importText(text);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    if (!this.sourcesService.remove(id)) {
      throw new NotFoundException('配置源不存在，或是不可删除的内置源');
    }
  }
}
