import { normalizeSourceKey } from './source-key';

export interface NamedSource {
  name: string;
  url: string;
}

export interface DuplicateSource extends NamedSource {
  /** 撞上的那条已有源的名称 */
  conflictWith: string;
}

export interface DedupeResult {
  added: NamedSource[];
  duplicates: DuplicateSource[];
}

/**
 * 按归一化 key 判重的去重池。探测时一级候选与二级展开结果共用一个实例，
 * 保证同一个链接全程只探测一次。
 */
export class SourceDeduper {
  private readonly keys = new Set<string>();

  constructor(urls: Iterable<string> = []) {
    for (const url of urls) {
      this.keys.add(normalizeSourceKey(url));
    }
  }

  has(url: string): boolean {
    return this.keys.has(normalizeSourceKey(url));
  }

  /** 未见过则记录并返回 true；已见过返回 false。 */
  tryAdd(url: string): boolean {
    const key = normalizeSourceKey(url);
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  get size(): number {
    return this.keys.size;
  }
}

/**
 * 用去重池过滤一批探测候选：池子里没见过的留下并登记，见过的丢弃。
 * 探测器用它处理多仓子链接、README 链接、GitHub tree 文件等二级展开结果。
 */
export function dedupeCandidates<T extends { url: string }>(deduper: SourceDeduper, candidates: T[]): T[] {
  return candidates.filter((candidate) => deduper.tryAdd(candidate.url));
}

/**
 * 把一批待导入的源与已有源去重。同一批内部的重复也会判掉，保留先出现的那条。
 */
export function dedupeIncoming(existing: NamedSource[], incoming: NamedSource[]): DedupeResult {
  const byKey = new Map<string, string>();
  for (const source of existing) {
    const key = normalizeSourceKey(source.url);
    if (!byKey.has(key)) byKey.set(key, source.name);
  }

  const added: NamedSource[] = [];
  const duplicates: DuplicateSource[] = [];

  for (const source of incoming) {
    const key = normalizeSourceKey(source.url);
    const conflictWith = byKey.get(key);
    if (conflictWith !== undefined) {
      duplicates.push({ ...source, conflictWith });
      continue;
    }
    byKey.set(key, source.name);
    added.push(source);
  }

  return { added, duplicates };
}
