import { describe, expect, it } from 'vitest';

import type { ConfigSource, ImportSourcesResponse } from '@shared/api.interface';

import { extractErrorMessage, summarizeImport } from './import-summary';

function source(name: string): ConfigSource {
  return { id: name, name, url: `https://${name}.com/a.json`, origin: 'custom' };
}

function response(over: Partial<ImportSourcesResponse> = {}): ImportSourcesResponse {
  return { added: [], duplicates: [], invalid: [], custom: [], ...over };
}

describe('summarizeImport', () => {
  it('有新增时是成功语气', () => {
    expect(summarizeImport(response({ added: [source('a')] }))).toEqual({
      tone: 'success',
      text: '新增 1 条',
    });
  });

  it('一条都没加进去时是警告语气，而不是成功', () => {
    const summary = summarizeImport(response({ duplicates: [{ name: 'x', url: 'u', conflictWith: '无邪多仓' }] }));

    expect(summary.tone).toBe('warning');
    expect(summary.text).toBe('没有新增，1 条重复已跳过');
  });

  it('同时有新增、重复和脏行时三项都报出来', () => {
    const summary = summarizeImport(
      response({
        added: [source('a')],
        duplicates: [{ name: 'x', url: 'u', conflictWith: '无邪多仓' }],
        invalid: ['这是一句话'],
      }),
    );

    expect(summary).toEqual({ tone: 'success', text: '新增 1 条，1 条重复已跳过，1 行无法识别' });
  });

  it('全是脏行时提示语气为警告', () => {
    expect(summarizeImport(response({ invalid: ['a', 'b'] }))).toEqual({
      tone: 'warning',
      text: '没有新增，2 行无法识别',
    });
  });

  it('什么都没解析出来时给一句明确的话', () => {
    expect(summarizeImport(response())).toEqual({ tone: 'warning', text: '没有解析到可导入的链接' });
  });
});

describe('extractErrorMessage', () => {
  // 本项目的 GlobalExceptionFilter 统一包成 { error: { code, message, ... } }
  it('读得出项目自己的错误信封', () => {
    const error = {
      response: {
        data: { error: { code: 'BAD_REQUEST', message: '导入内容过长，请控制在 200000 字符以内' } },
      },
    };

    expect(extractErrorMessage(error, '导入失败')).toBe('导入内容过长，请控制在 200000 字符以内');
  });

  it('也兼容 NestJS 默认的平铺 message', () => {
    const error = { response: { data: { message: 'text 必须是字符串' } } };

    expect(extractErrorMessage(error, '导入失败')).toBe('text 必须是字符串');
  });

  it('message 是数组时取第一条', () => {
    const error = { response: { data: { message: ['text 必须是字符串', '别的'] } } };

    expect(extractErrorMessage(error, '导入失败')).toBe('text 必须是字符串');
  });

  it('拿不到后端 message 时退回兜底文案', () => {
    expect(extractErrorMessage(new Error('Network Error'), '导入失败')).toBe('导入失败');
    expect(extractErrorMessage(undefined, '导入失败')).toBe('导入失败');
    expect(extractErrorMessage({ response: { data: {} } }, '导入失败')).toBe('导入失败');
    expect(extractErrorMessage({ response: { data: { error: {} } } }, '导入失败')).toBe('导入失败');
  });

  it('message 为空串时也退回兜底文案', () => {
    expect(extractErrorMessage({ response: { data: { message: '   ' } } }, '导入失败')).toBe('导入失败');
    expect(extractErrorMessage({ response: { data: { error: { message: '  ' } } } }, '导入失败')).toBe(
      '导入失败',
    );
  });
});
