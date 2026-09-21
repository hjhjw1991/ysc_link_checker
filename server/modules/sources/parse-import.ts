export interface ParsedSourceEntry {
  name: string;
  url: string;
}

export interface ParseImportResult {
  entries: ParsedSourceEntry[];
  /** 无法识别成 http(s) 链接的原始行，原样回给前端提示用户 */
  invalid: string[];
}

const URL_TOKEN = /https?:\/\/\S+/gi;

/**
 * 解析用户粘贴的导入文本。每行一条，支持三种写法：
 *   https://a.com/x.json
 *   名称,https://a.com/x.json
 *   名称 https://a.com/x.json        （空格或制表符分隔）
 * 空行、`#` 与 `//` 开头的注释行直接跳过。
 */
export function parseImportText(text: string): ParseImportResult {
  const entries: ParsedSourceEntry[] = [];
  const invalid: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const matches = [...line.matchAll(URL_TOKEN)];
    const last = matches[matches.length - 1];
    if (!last) {
      invalid.push(line);
      continue;
    }

    const url = last[0];
    // 只有链接在行尾才算「名称 + 链接」；链接后面还有内容说明这行不是我们认得的格式
    if (last.index + url.length !== line.length) {
      invalid.push(line);
      continue;
    }

    const name = line.slice(0, last.index).trim().replace(/[,，]$/, '').trim();
    entries.push({ name: name || fallbackName(url), url });
  }

  return { entries, invalid };
}

function fallbackName(url: string): string {
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split('/').filter(Boolean).pop();
    return file ? `${parsed.hostname}/${file}` : parsed.hostname;
  } catch {
    return url;
  }
}
