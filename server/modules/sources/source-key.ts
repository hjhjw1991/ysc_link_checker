import { domainToASCII } from 'node:url';

const GH_PROXY_PREFIXES = ['https://gh-proxy.com/', 'http://gh-proxy.com/'];

/**
 * 把一条配置源链接归一成去重用的 key。
 *
 * 口径刻意保守——「宁可错放，不要多删」：只合并确定等价的写法，任何可能代表不同资源的
 * 差异（http/https、路径大小写、查询串）一律保留，解析不了的串原样退回。
 */
export function normalizeSourceKey(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const unwrapped = stripGhProxy(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(unwrapped);
  } catch {
    // 不是合法 URL：退回原文小写，只跟字面完全相同的串合并
    return trimmed.toLowerCase();
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return trimmed.toLowerCase();
  }

  // hostname 已由 URL 小写化；中文域名再转一次 punycode，保证两种写法同 key
  const host = domainToASCII(parsed.hostname) || parsed.hostname;
  const port = isDefaultPort(parsed.protocol, parsed.port) ? '' : `:${parsed.port}`;
  // 路径大小写敏感，只去掉末尾斜杠；根路径归一成空串
  const pathname = parsed.pathname.replace(/\/+$/, '');

  return `${parsed.protocol}//${host}${port}${pathname}${parsed.search}`;
}

function stripGhProxy(url: string): string {
  for (const prefix of GH_PROXY_PREFIXES) {
    if (!url.toLowerCase().startsWith(prefix)) continue;
    const rest = url.slice(prefix.length);
    // 只有后面确实跟着一个完整链接时才剥，否则 gh-proxy.com 下的普通路径会被误伤
    if (/^https?:\/\//i.test(rest)) return rest;
  }
  return url;
}

function isDefaultPort(protocol: string, port: string): boolean {
  if (!port) return true;
  return (protocol === 'https:' && port === '443') || (protocol === 'http:' && port === '80');
}
