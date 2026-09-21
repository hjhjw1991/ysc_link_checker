import { Injectable } from '@nestjs/common';

import type { ConfigSource, ImportSourcesResponse, ListSourcesResponse } from '@shared/api.interface';

import { BUILTIN_SOURCES, type BuiltinSource } from './builtin-sources';
import { CustomSourceStore } from './custom-source-store';
import { SourceDeduper, dedupeIncoming } from './dedupe';
import { parseImportText } from './parse-import';

/** 探测器真正消费的候选形态：自定义源没有 special 标记 */
export interface ProbeCandidate extends BuiltinSource {
  origin: 'builtin' | 'custom';
}

const BUILTIN_ID_PREFIX = 'builtin-';

@Injectable()
export class SourcesService {
  constructor(private readonly store: CustomSourceStore) {}

  listAll(): ListSourcesResponse {
    return { builtin: this.listBuiltin(), custom: this.store.list() };
  }

  importText(text: string): ImportSourcesResponse {
    const { entries, invalid } = parseImportText(text);
    const existing = [...this.listBuiltin(), ...this.store.list()];
    const { added, duplicates } = dedupeIncoming(existing, entries);

    const created = this.store.add(added);
    return { added: created, duplicates, invalid, custom: this.store.list() };
  }

  /** 只允许删自定义源；内置源固定在代码里，删不掉 */
  remove(id: string): boolean {
    if (id.startsWith(BUILTIN_ID_PREFIX)) return false;
    return this.store.remove(id);
  }

  /**
   * 探测用的一级候选：内置源在前、自定义源在后，整体按归一化 key 去重
   * （重复时保留先出现的那条，也就是内置源优先）。
   */
  getProbeCandidates(): ProbeCandidate[] {
    const deduper = new SourceDeduper();
    const candidates: ProbeCandidate[] = [];

    for (const source of BUILTIN_SOURCES) {
      if (deduper.tryAdd(source.url)) {
        candidates.push({ ...source, origin: 'builtin' });
      }
    }
    for (const source of this.store.list()) {
      if (deduper.tryAdd(source.url)) {
        candidates.push({ name: source.name, url: source.url, origin: 'custom' });
      }
    }
    return candidates;
  }

  private listBuiltin(): ConfigSource[] {
    return BUILTIN_SOURCES.map((source, index) => ({
      id: `${BUILTIN_ID_PREFIX}${index}`,
      name: source.name,
      url: source.url,
      origin: 'builtin' as const,
    }));
  }
}
