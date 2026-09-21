import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { SourceDeduper, dedupeCandidates } from '../sources/dedupe';
import { HEALTH_AVAILABLE_THRESHOLD, scoreHealth, tolerantJsonParse } from './health';
import { normalizeSourceKey } from '../sources/source-key';
import { SourcesService, type ProbeCandidate } from '../sources/sources.service';
import type {
  ProbeResponse,
  ProbeResultItem,
  ProbeProgressResponse,
  ProbeTaskStatus,
} from '@shared/api.interface';

const TIMEOUT_MS = 8000;
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

  constructor(private readonly sourcesService: SourcesService) {}

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
      // 一级候选（内置 + 自定义）在 SourcesService 里已经去过重；这里用同一个池子
      // 继续兜住二级展开，保证整场探测里同一个链接只跑一次。
      const candidates = this.sourcesService.getProbeCandidates();
      const deduper = new SourceDeduper(candidates.map((c) => c.url));
      task.total = candidates.length;

      const firstPromises = candidates.map(async (src: ProbeCandidate) => {
        task.currentItemName = src.name;
        task.currentItemUrl = src.url;
        const result = await this.probeOne(src.name, src.url, false, Boolean(src.special));
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

      const expandSources: { name: string; url: string }[] = [];
      // 结果里的 url 可能已经被改写成 gh-proxy 镜像，按归一化 key 回查才认得出原候选
      const candidateByKey = new Map(candidates.map((c) => [normalizeSourceKey(c.url), c]));

      for (const r of firstLevelResults) {
        const src = candidateByKey.get(normalizeSourceKey(r.url));
        // 索引源不是配置，评不到 80 分是正常的；只要连得通就该展开
        const reachable = r.healthTier !== 'dead';
        if (src?.special ? !reachable : !r.available) continue;

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

      // 多仓之间常互相收录同一条线路，展开结果里重复很多；过一遍去重池再探测
      const newExpandSources = dedupeCandidates(deduper, expandSources);
      this.logger.log(
        `一级候选 ${candidates.length} 条；二级展开 ${expandSources.length} 条，` +
          `去重后新增 ${newExpandSources.length} 条`,
      );

      if (newExpandSources.length > 0) {
        task.total += newExpandSources.length;

        const secondPromises = newExpandSources.map(async (src) => {
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
    /** 索引源（GitHub README / 仓库文件树）：本身不是配置，只用来发现别的链接 */
    isIndexSource = false,
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

      const responseTimeMs = Date.now() - startTime;

      if (!response) {
        return this.deadResult(name, finalUrl, responseTimeMs, '请求失败或超时', fromMultiWarehouse);
      }
      if (response.status !== 200) {
        return {
          ...this.deadResult(name, finalUrl, responseTimeMs, `HTTP ${response.status}`, fromMultiWarehouse),
          statusCode: response.status,
          responseSizeBytes: response.body.length,
        };
      }

      const health = scoreHealth({
        body: response.body,
        contentType: response.headers['content-type'] || '',
        responseTimeMs,
      });

      const reason = isIndexSource ? '索引源：用于发现其他链接，本身不是配置' : health.reason;
      const available = !isIndexSource && health.health >= HEALTH_AVAILABLE_THRESHOLD;

      return {
        name,
        url: finalUrl,
        available,
        health: health.health,
        healthTier: health.tier,
        contentCount: health.contentCount,
        healthReason: reason,
        type: health.type,
        statusCode: response.status,
        responseTimeMs,
        responseSizeBytes: response.body.length,
        // 保留 errorReason 给旧的展示逻辑：够不上「可用」时说明原因
        errorReason: available ? undefined : reason,
        fromMultiWarehouse,
      };
    } catch (error) {
      return this.deadResult(
        name,
        url,
        Date.now() - startTime,
        error instanceof Error ? error.message : '未知错误',
        fromMultiWarehouse,
      );
    }
  }

  private deadResult(
    name: string,
    url: string,
    responseTimeMs: number,
    reason: string,
    fromMultiWarehouse: boolean,
  ): ProbeResultItem {
    return {
      name,
      url,
      available: false,
      health: 0,
      healthTier: 'dead',
      contentCount: 0,
      healthReason: reason,
      responseTimeMs,
      errorReason: reason,
      fromMultiWarehouse,
    };
  }

  private async safeGet(url: string): Promise<{
    status: number;
    /** 原始字节：识别二进制内容必须看字节，不能只看解码后的字符串 */
    body: Buffer;
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
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      const body = Buffer.from(response.data as ArrayBuffer);
      return {
        status: response.status,
        body,
        data: body.toString('utf-8'),
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




  private async extractMultiWarehouseChildren(url: string): Promise<{ name: string; url: string }[]> {
    const response = await this.safeGet(this.encodeUrl(url));
    if (!response || response.status !== 200) return [];

    const parsed = tolerantJsonParse(response.data);
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

    const parsed = tolerantJsonParse(response.data);
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
