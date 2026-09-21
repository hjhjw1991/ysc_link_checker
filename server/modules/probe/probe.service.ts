import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type {
  ProbeResponse,
  ProbeResultItem,
  ProbeResultType,
  ProbeProgressResponse,
  ProbeTaskStatus,
} from '@shared/api.interface';

const TIMEOUT_MS = 8000;
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

interface CandidateSource {
  name: string;
  url: string;
  special?: 'github-readme' | 'github-tree';
}

const BUILTIN_SOURCES: CandidateSource[] = [
  { name: '无邪多仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/wx.json' },
  { name: '无邪优选仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/yx.txt' },
  { name: '无邪聚合仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/jh.txt' },
  { name: '月光宝盒多仓', url: 'https://jihulab.com/ygbh1/box/raw/main/dcang/dc.json' },
  { name: '自用多仓', url: 'https://raw.liucn.cc/box/dm.txt' },
  { name: '影视仓YSC配置', url: 'https://jihulab.com/mengzhu2/ysc/raw/main/YSC.json' },
  { name: 'HG影视配置', url: 'https://api.hgyx.vip/hgyx.json' },
  { name: '聚玩盒子4K', url: 'http://xhztv.top/4k.json' },
  { name: '动漫专线', url: 'https://www.yingm.cc/dm/dm.json' },
  { name: '游魂直播源', url: 'https://www.iyouhun.com/tv/zb' },
  { name: 'IPTV直播源', url: 'https://live.zbds.top/tv/iptv4.txt' },
  { name: '饭太硬线路', url: 'http://www.饭太硬.net/tv' },
  { name: '饭太硬备用', url: 'http://fty.888484.xyz/tv' },
  { name: '王二小线路', url: 'http://tvbox.王二小放牛娃.top' },
  { name: '王二小备用', url: 'https://9280.kstore.vip/newwex.json' },
  { name: '短剧专线', url: 'http://box.ufuzi.com/tv/qq/短剧频道/api.json' },
  { name: '儿童专线', url: 'https://jihulab.com/ymz1231/xymz/raw/main/ymshaoer' },
  { name: 'GitHub接口大全', url: 'https://raw.githubusercontent.com/wuxierj/TVBox/main/README.md', special: 'github-readme' },
  { name: 'GitHub配置库', url: 'https://api.github.com/repos/qist/tvbox/git/trees/master?recursive=1', special: 'github-tree' },
];

interface ProbeTask {
  id: string;
  status: ProbeTaskStatus;
  total: number;
  completed: number;
  available: number;
  unavailable: number;
  currentItemName?: string;
  currentItemUrl?: string;
  items: ProbeResultItem[];
  startTime: number;
  error?: string;
}

@Injectable()
export class ProbeService {
  private readonly logger = new Logger(ProbeService.name);
  private tasks = new Map<string, ProbeTask>();

  startProbe(): string {
    const taskId = this.genTaskId();
    const task: ProbeTask = {
      id: taskId,
      status: 'running',
      total: 0,
      completed: 0,
      available: 0,
      unavailable: 0,
      items: [],
      startTime: Date.now(),
    };
    this.tasks.set(taskId, task);
    void this.runProbe(task);
    return taskId;
  }

  getProgress(taskId: string): ProbeProgressResponse | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      taskId: task.id,
      status: task.status,
      total: task.total,
      completed: task.completed,
      available: task.available,
      unavailable: task.unavailable,
      currentItemName: task.currentItemName,
      currentItemUrl: task.currentItemUrl,
      items: task.items,
      elapsedMs: Date.now() - task.startTime,
      error: task.error,
    };
  }

  getFinalResult(taskId: string): ProbeResponse | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'completed') return null;
    return {
      total: task.total,
      available: task.available,
      unavailable: task.unavailable,
      items: task.items,
      elapsedMs: 0,
    };
  }

  private async runProbe(task: ProbeTask): Promise<void> {
    try {
      const firstLevelResults: ProbeResultItem[] = [];
      task.total = BUILTIN_SOURCES.length;

      const firstPromises = BUILTIN_SOURCES.map(async (src: CandidateSource) => {
        task.currentItemName = src.name;
        task.currentItemUrl = src.url;
        const result = await this.probeOne(src.name, src.url, false);
        firstLevelResults.push(result);
        task.items.push(result);
        task.completed += 1;
        if (result.available) {
          task.available += 1;
        } else {
          task.unavailable += 1;
        }
      });

      await Promise.all(firstPromises);

      const expandSources: CandidateSource[] = [];

      for (const r of firstLevelResults) {
        if (!r.available) continue;

        const src = BUILTIN_SOURCES.find((s: CandidateSource) => s.url === r.url);
        if (src?.special === 'github-readme') {
          const links = await this.extractLinksFromReadme(r.url);
          for (const link of links) {
            expandSources.push({ name: `README-${link.substring(0, 40)}`, url: link });
          }
          continue;
        }
        if (src?.special === 'github-tree') {
          const links = await this.extractLinksFromGithubTree(r.url);
          for (const link of links) {
            expandSources.push({ name: `qist-${link.name}`, url: link.url });
          }
          continue;
        }

        if (r.type === '多仓') {
          const children = await this.extractMultiWarehouseChildren(r.url);
          for (const child of children) {
            expandSources.push({ name: `${r.name}-${child.name || child.url.substring(0, 30)}`, url: child.url });
          }
        }
      }

      if (expandSources.length > 0) {
        const prevTotal = task.total;
        task.total = prevTotal + expandSources.length;

        const secondPromises = expandSources.map(async (src: CandidateSource) => {
          task.currentItemName = src.name;
          task.currentItemUrl = src.url;
          const result = await this.probeOne(src.name, src.url, true);
          task.items.push(result);
          task.completed += 1;
          if (result.available) {
            task.available += 1;
          } else {
            task.unavailable += 1;
          }
        });

        await Promise.all(secondPromises);
      }

      task.status = 'completed';
      task.currentItemName = undefined;
      task.currentItemUrl = undefined;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : '未知错误';
      this.logger.error('探测任务失败: ' + task.error);
    } finally {
      setTimeout(() => {
        this.tasks.delete(task.id);
      }, 5 * 60 * 1000);
    }
  }

  private async probeOne(
    name: string,
    url: string,
    fromMultiWarehouse: boolean,
  ): Promise<ProbeResultItem> {
    const startTime = Date.now();
    const encodedUrl = this.encodeUrl(url);

    try {
      let finalUrl = encodedUrl;
      let response = await this.safeGet(finalUrl);

      if (!response && encodedUrl.includes('raw.githubusercontent.com')) {
        const ghProxyUrl = 'https://gh-proxy.com/' + encodedUrl;
        response = await this.safeGet(ghProxyUrl);
        if (response) finalUrl = ghProxyUrl;
      }

      if (!response) {
        return {
          name,
          url: finalUrl,
          available: false,
          responseTimeMs: Date.now() - startTime,
          errorReason: '请求失败或超时',
          fromMultiWarehouse,
        };
      }

      const { status, data, headers } = response;
      const responseTimeMs = Date.now() - startTime;
      const responseSizeBytes = typeof data === 'string' ? Buffer.byteLength(data, 'utf-8') : 0;

      if (status !== 200) {
        return {
          name,
          url: finalUrl,
          available: false,
          statusCode: status,
          responseTimeMs,
          responseSizeBytes,
          errorReason: `HTTP ${status}`,
          fromMultiWarehouse,
        };
      }

      if (!data || (typeof data === 'string' && data.trim().length === 0)) {
        return {
          name,
          url: finalUrl,
          available: false,
          statusCode: status,
          responseTimeMs,
          responseSizeBytes,
          errorReason: '响应体为空',
          fromMultiWarehouse,
        };
      }

      const contentType = (headers['content-type'] || '').toLowerCase();
      const text = typeof data === 'string' ? data : String(data);

      if (this.looksLikeHtml(text, contentType)) {
        return {
          name,
          url: finalUrl,
          available: false,
          statusCode: status,
          responseTimeMs,
          responseSizeBytes,
          errorReason: '返回HTML页面(可能是防爬或JS挑战)',
          fromMultiWarehouse,
        };
      }

      const jsonResult = this.tolerantJsonParse(text);
      if (jsonResult !== null) {
        const type = this.classifyJsonType(jsonResult);
        return {
          name,
          url: finalUrl,
          available: true,
          type,
          statusCode: status,
          responseTimeMs,
          responseSizeBytes,
          fromMultiWarehouse,
        };
      }

      if (responseSizeBytes >= 200) {
        return {
          name,
          url: finalUrl,
          available: true,
          type: '直播列表',
          statusCode: status,
          responseTimeMs,
          responseSizeBytes,
          fromMultiWarehouse,
        };
      }

      return {
        name,
        url: finalUrl,
        available: false,
        statusCode: status,
        responseTimeMs,
        responseSizeBytes,
        errorReason: '内容过短且无法解析',
        fromMultiWarehouse,
      };
    } catch (error) {
      return {
        name,
        url,
        available: false,
        responseTimeMs: Date.now() - startTime,
        errorReason: error instanceof Error ? error.message : '未知错误',
        fromMultiWarehouse,
      };
    }
  }

  private async safeGet(url: string): Promise<{
    status: number;
    data: string;
    headers: Record<string, string>;
  } | null> {
    try {
      const response = await axios.get(url, {
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        validateStatus: () => true,
      });
      return {
        status: response.status,
        data: response.data,
        headers: response.headers as Record<string, string>,
      };
    } catch {
      return null;
    }
  }

  private encodeUrl(urlStr: string): string {
    try {
      const urlObj = new URL(urlStr);
      const hostname = urlObj.hostname;
      if (/[\u4e00-\u9fa5]/.test(hostname)) {
        urlObj.hostname = this.toPunycode(hostname);
      }
      const pathname = urlObj.pathname;
      if (/[\u4e00-\u9fa5]/.test(pathname)) {
        const segments = pathname.split('/').map((seg: string) =>
          /[\u4e00-\u9fa5]/.test(seg) ? encodeURIComponent(seg) : seg,
        );
        urlObj.pathname = segments.join('/');
      }
      return urlObj.toString();
    } catch {
      return urlStr;
    }
  }

  private toPunycode(domain: string): string {
    const parts = domain.split('.');
    const encoded = parts.map((part: string) => {
      if (/[\u4e00-\u9fa5]/.test(part)) {
        return 'xn--' + this.punycodeEncode(part);
      }
      return part;
    });
    return encoded.join('.');
  }

  private punycodeEncode(input: string): string {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = 700;
    const initialBias = 72;
    const initialN = 128;
    const delimiter = '-';

    const output: string[] = [];
    let n = initialN;
    let delta = 0;
    let bias = initialBias;
    let h = 0;

    const codepoints: number[] = [];
    for (const char of input) {
      codepoints.push(char.codePointAt(0) || 0);
    }

    const b = codepoints.filter((cp: number) => cp < 0x80).length;
    const basicChars = codepoints.filter((cp: number) => cp < 0x80);
    for (const cp of basicChars) {
      output.push(String.fromCharCode(cp));
    }

    h = b;

    if (b > 0) output.push(delimiter);

    while (h < codepoints.length) {
      let m = Number.MAX_VALUE;
      for (const cp of codepoints) {
        if (cp >= n && cp < m) m = cp;
      }

      delta += (m - n) * (h + 1);
      n = m;

      for (const cp of codepoints) {
        if (cp < n) delta += 1;
        if (cp === n) {
          let q = delta;
          for (let k = base; ; k += base) {
            const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
            if (q < t) break;
            output.push(
              this.digitToChar(t + ((q - t) % (base - t))),
            );
            q = Math.floor((q - t) / (base - t));
          }
          output.push(this.digitToChar(q));

          bias = this.adapt(delta, h + 1, h === b);
          delta = 0;
          h += 1;
        }
      }

      delta += 1;
      n += 1;
    }

    return output.join('');
  }

  private digitToChar(d: number): string {
    const code = d + 22;
    const lowercaseOffset = d < 26 ? 1 : 0;
    return String.fromCharCode(code + lowercaseOffset * 75 - 22 + 48 + (d < 26 ? 0 : -26 + 26));
  }

  private adapt(delta: number, numpoints: number, firsttime: boolean): number {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = firsttime ? 700 : 2;
    let k = 0;
    delta = Math.floor(delta / damp);
    delta += Math.floor(delta / numpoints);
    while (delta > ((base - tMin) * tMax) / 2) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return Math.floor(k + ((base - tMin + 1) * delta) / (delta + skew));
  }

  private looksLikeHtml(text: string, contentType: string): boolean {
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

  private tolerantJsonParse(text: string): unknown | null {
    let cleaned = text.trim();

    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      return null;
    }

    cleaned = cleaned
      .replace(/^\/\/[^\n]*/gm, '')
      .replace(/^\s*#[^\n]*/gm, '');

    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    cleaned = cleaned.replace(
      /("(?:\\.|[^"\\])*")/g,
      (match: string) =>
        match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
    );

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  private classifyJsonType(obj: unknown): ProbeResultType {
    if (!obj || typeof obj !== 'object') return 'JSON配置';

    const o = obj as Record<string, unknown>;

    if (
      'storeHouse' in o ||
      'urls' in o
    ) {
      const urlsValue = o.urls;
      const storeHouseValue = o.storeHouse;
      if (
        (Array.isArray(urlsValue) && urlsValue.length > 0) ||
        (Array.isArray(storeHouseValue) && storeHouseValue.length > 0)
      ) {
        return '多仓';
      }
    }

    if (
      'sites' in o ||
      'spiders' in o ||
      'lives' in o ||
      'parses' in o
    ) {
      return '影视配置';
    }

    return 'JSON配置';
  }

  private async extractMultiWarehouseChildren(url: string): Promise<{ name: string; url: string }[]> {
    const response = await this.safeGet(this.encodeUrl(url));
    if (!response || response.status !== 200) return [];

    const parsed = this.tolerantJsonParse(response.data);
    if (!parsed || typeof parsed !== 'object') return [];

    const result: { name: string; url: string }[] = [];
    const o = parsed as Record<string, unknown>;

    const urlsArr = Array.isArray(o.urls) ? o.urls : [];
    const storeHouseArr = Array.isArray(o.storeHouse) ? o.storeHouse : [];
    const combined = [...urlsArr, ...storeHouseArr];

    for (const item of combined) {
      if (typeof item === 'string' && item.startsWith('http')) {
        result.push({ name: item.substring(0, 40), url: item });
      } else if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        const urlItem = itemObj.url || itemObj.source || itemObj.link;
        const nameItem = itemObj.name || itemObj.title || '';
        if (typeof urlItem === 'string' && urlItem.startsWith('http')) {
          result.push({ name: String(nameItem || urlItem.substring(0, 40)), url: urlItem });
        }
      }
    }

    return result.slice(0, 30);
  }

  private async extractLinksFromReadme(url: string): Promise<string[]> {
    const response = await this.safeGet(this.encodeUrl(url));
    if (!response || response.status !== 200) return [];

    const text = response.data;
    const urlRegex = /https?:\/\/[^\s"'<>\)\]]+/g;
    const matches = text.match(urlRegex) || [];

    const filtered = matches.filter((u: string) => {
      const clean = u.replace(/[.,;:!?]+$/, '');
      return (
        clean.startsWith('http') &&
        !clean.includes('github.com') &&
        !clean.includes('jq') &&
        clean.length > 10
      );
    });

    const unique = [...new Set(filtered.map((u: string) => u.replace(/[.,;:!?]+$/, '')))];
    return unique.slice(0, 20);
  }

  private async extractLinksFromGithubTree(url: string): Promise<{ name: string; url: string }[]> {
    const response = await this.safeGet(this.encodeUrl(url));
    if (!response || response.status !== 200) return [];

    const parsed = this.tolerantJsonParse(response.data);
    if (!parsed || typeof parsed !== 'object') return [];

    const tree = (parsed as Record<string, unknown>).tree;
    if (!Array.isArray(tree)) return [];

    const excludedDirs = ['jar/', 'lib/', 'py/', 'tools/', '.github/', 'biliext/'];
    const rawBase = 'https://raw.githubusercontent.com/qist/tvbox/master/';
    const result: { name: string; url: string }[] = [];

    for (const item of tree) {
      if (!item || typeof item !== 'object') continue;
      const path = String((item as Record<string, unknown>).path || '');
      const type = String((item as Record<string, unknown>).type || '');
      if (type !== 'blob') continue;

      if (excludedDirs.some((dir: string) => path.startsWith(dir))) continue;

      const lower = path.toLowerCase();
      if (
        lower.endsWith('.json') ||
        lower.endsWith('.txt') ||
        lower.endsWith('.m3u') ||
        lower.endsWith('.m3u8')
      ) {
        result.push({ name: path, url: rawBase + path });
      }
    }

    return result.slice(0, 25);
  }

  private genTaskId(): string {
    return 'probe_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
}
