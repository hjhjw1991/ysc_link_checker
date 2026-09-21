import type { ImportSourcesResponse } from '@shared/api.interface';

export interface ImportSummary {
  /** success = 至少加进去一条；warning = 一条都没加进去，但请求本身是成功的 */
  tone: 'success' | 'warning';
  text: string;
}

export function summarizeImport(result: ImportSourcesResponse): ImportSummary {
  const { added, duplicates, invalid } = result;

  if (added.length === 0 && duplicates.length === 0 && invalid.length === 0) {
    return { tone: 'warning', text: '没有解析到可导入的链接' };
  }

  const parts = [added.length > 0 ? `新增 ${added.length} 条` : '没有新增'];
  if (duplicates.length > 0) parts.push(`${duplicates.length} 条重复已跳过`);
  if (invalid.length > 0) parts.push(`${invalid.length} 行无法识别`);

  return { tone: added.length > 0 ? 'success' : 'warning', text: parts.join('，') };
}

interface ErrorResponseBody {
  /** 本项目 GlobalExceptionFilter 的统一信封 */
  error?: { message?: unknown };
  /** NestJS 默认的平铺结构，校验错误时是字符串数组 */
  message?: unknown;
}

/** 从 axios 错误里取后端给的 message，取不到就用兜底文案 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: ErrorResponseBody } })?.response?.data;
  return pickMessage(data?.error?.message) ?? pickMessage(data?.message) ?? fallback;
}

function pickMessage(message: unknown): string | null {
  const first = Array.isArray(message) ? message[0] : message;
  return typeof first === 'string' && first.trim() ? first : null;
}
