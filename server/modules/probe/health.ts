import type { ProbeResultType } from '@shared/api.interface';

/**
 * 健康度分档：
 *   0        完全不可用——HTML 挑战页、二进制文件、空响应，压根不是配置
 *   40       能访问，但认不出是配置（`{}`、`{"error":...}`、看不出条目的纯文本）
 *   60       是配置形态，但里面一条内容都没有（`{"sites": []}`）
 *   80~100   有真实内容，再按内容规模、响应速度、字段完整度加分
 */
export type HealthTier = 'dead' | 'not-config' | 'empty-config' | 'healthy';

/** 达到这个分数才算「可用」：结构合法还不够，得真有东西 */
export const HEALTH_AVAILABLE_THRESHOLD = 80;

const TIER_SCORE: Record<HealthTier, number> = {
  dead: 0,
  'not-config': 40,
  'empty-config': 60,
  healthy: 80,
};

export interface HealthInput {
  body: Buffer;
  contentType: string;
  responseTimeMs: number;
}

export interface HealthResult {
  health: number;
  tier: HealthTier;
  type?: ProbeResultType;
  /** 配置里真实可用的条目数：影视配置数 sites+lives，多仓数子线路，列表数频道 */
  contentCount: number;
  reason: string;
}

const BINARY_CONTENT_TYPES = ['image/', 'audio/', 'video/', 'font/', 'application/octet-stream', 'application/zip'];

export function scoreHealth({ body, contentType, responseTimeMs }: HealthInput): HealthResult {
  const ct = contentType.toLowerCase();

  if (body.length === 0 || body.toString('utf-8').trim().length === 0) {
    return dead('响应体为空');
  }
  if (BINARY_CONTENT_TYPES.some((prefix) => ct.startsWith(prefix)) || looksBinary(body)) {
    return dead('不是配置文件（二进制内容）');
  }

  const text = body.toString('utf-8');
  if (looksLikeHtml(text, ct)) {
    return dead('返回HTML页面(可能是防爬或JS挑战)');
  }

  const profile = profileContent(text);
  if (!profile) {
    return { health: TIER_SCORE['not-config'], tier: 'not-config', contentCount: 0, reason: '内容不是可识别的配置或列表' };
  }
  if (profile.type === 'JSON配置') {
    return {
      health: TIER_SCORE['not-config'],
      tier: 'not-config',
      type: 'JSON配置',
      contentCount: 0,
      reason: '是合法 JSON，但不含影视配置/多仓/直播列表字段',
    };
  }
  if (profile.count === 0) {
    return {
      health: TIER_SCORE['empty-config'],
      tier: 'empty-config',
      type: profile.type,
      contentCount: 0,
      reason: '配置结构合法，但里面没有任何条目',
    };
  }

  const bonus = sizeBonus(profile.count) + speedBonus(responseTimeMs) + profile.completeness;
  return {
    health: Math.min(100, TIER_SCORE.healthy + bonus),
    tier: 'healthy',
    type: profile.type,
    contentCount: profile.count,
    reason: `含 ${profile.count} 条可用内容`,
  };
}

function dead(reason: string): HealthResult {
  return { health: TIER_SCORE.dead, tier: 'dead', contentCount: 0, reason };
}

/** 条目规模：给多的源更高分，但收益递减 */
function sizeBonus(count: number): number {
  if (count >= 100) return 12;
  if (count >= 50) return 10;
  if (count >= 20) return 8;
  if (count >= 10) return 6;
  if (count >= 3) return 4;
  return 2;
}

function speedBonus(ms: number): number {
  if (ms < 500) return 5;
  if (ms < 1000) return 4;
  if (ms < 2000) return 3;
  if (ms < 4000) return 2;
  return 1;
}

interface ContentProfile {
  type: ProbeResultType;
  count: number;
  /** 字段完整度加分 0~3，只有影视配置才有 */
  completeness: number;
}

function profileContent(text: string): ContentProfile | null {
  const obj = tolerantJsonParse(text);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return profileJson(obj as Record<string, unknown>);
  }
  const count = countListEntries(text);
  if (count > 0) return { type: '直播列表', count, completeness: 0 };
  return null;
}

function profileJson(o: Record<string, unknown>): ContentProfile {
  const len = (key: string) => (Array.isArray(o[key]) ? (o[key] as unknown[]).length : 0);

  if ('storeHouse' in o || 'urls' in o) {
    return { type: '多仓', count: len('storeHouse') + len('urls'), completeness: 0 };
  }
  if ('sites' in o || 'spiders' in o || 'lives' in o || 'parses' in o) {
    const completeness =
      (typeof o.spider === 'string' && o.spider ? 1 : 0) + (len('parses') > 0 ? 1 : 0) + (len('lives') > 0 ? 1 : 0);
    return { type: '影视配置', count: len('sites') + len('spiders') + len('lives'), completeness };
  }
  return { type: 'JSON配置', count: 0, completeness: 0 };
}

/** 文本列表的条目数：m3u 的 #EXTINF，或「名称,http://...」这类行 */
function countListEntries(text: string): number {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const extinf = lines.filter((line) => line.toUpperCase().startsWith('#EXTINF')).length;
  if (extinf > 0) return extinf;
  return lines.filter((line) => /,\s*https?:\/\//i.test(line)).length;
}

/** 前 512 字节出现 NUL 基本可以断定是二进制 */
function looksBinary(body: Buffer): boolean {
  return body.subarray(0, 512).includes(0);
}

function looksLikeHtml(text: string, contentType: string): boolean {
  if (contentType.includes('text/html')) return true;
  const trimmed = text.trim();
  if (/^<!doctype\s+html/i.test(trimmed)) return true;
  if (/^<html[\s>]/i.test(trimmed)) return true;
  if (/^<head[\s>]/i.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('<body') && lower.includes('</body>')) return true;
  if (lower.includes('javascript') && lower.includes('<script')) return true;
  return false;
}

/**
 * 宽容解析民间配置：去掉 `//` 与 `#` 注释行、去尾逗号、转义字符串里的裸换行。
 * 注释匹配必须允许行首缩进——真实配置里大量出现 `    //////////` 这种缩进注释。
 */
export function tolerantJsonParse(text: string): unknown | null {
  // 先去注释再判断是不是 JSON：真实配置里有不少文件是以 `//说明` 开头的，
  // 顺序反了会把它们直接判成非 JSON。
  let cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '')
    .replace(/^[ \t]*#[^\n]*/gm, '')
    .trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return null;

  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  cleaned = cleaned.replace(/("(?:\\.|[^"\\])*")/g, (match: string) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
  );

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
