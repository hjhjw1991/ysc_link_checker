import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ConfigSource } from '@shared/api.interface';

import type { NamedSource } from './dedupe';

export const DEFAULT_STORE_FILE = join(process.cwd(), 'data', 'custom-sources.json');

/**
 * 自定义配置源的落盘存储。本项目没有数据库，用一个 JSON 文件足够：
 * 数据量是几十条，读多写少，进程内缓存 + 写时整体替换。
 *
 * 写入走「临时文件 + rename」，避免进程在写一半时被杀导致文件半截损坏。
 */
export class CustomSourceStore {
  private readonly file: string;
  private cache: ConfigSource[] | null = null;

  constructor(file: string = DEFAULT_STORE_FILE) {
    this.file = file;
  }

  list(): ConfigSource[] {
    return this.read().map((source) => ({ ...source }));
  }

  add(entries: NamedSource[]): ConfigSource[] {
    const created: ConfigSource[] = entries.map((entry) => ({
      id: randomUUID(),
      name: entry.name,
      url: entry.url,
      origin: 'custom' as const,
    }));
    if (created.length > 0) {
      this.write([...this.read(), ...created]);
    }
    return created.map((source) => ({ ...source }));
  }

  remove(id: string): boolean {
    const current = this.read();
    const next = current.filter((source) => source.id !== id);
    if (next.length === current.length) return false;
    this.write(next);
    return true;
  }

  private read(): ConfigSource[] {
    if (this.cache) return this.cache;
    this.cache = this.readFromDisk();
    return this.cache;
  }

  private readFromDisk(): ConfigSource[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf-8'));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isConfigSource).map((source) => ({ ...source, origin: 'custom' as const }));
    } catch {
      // 文件被手动改坏时不要让服务起不来，按空列表处理
      return [];
    }
  }

  private write(sources: ConfigSource[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(sources, null, 2), 'utf-8');
      renameSync(tmp, this.file);
    } catch (error) {
      if (existsSync(tmp)) unlinkSync(tmp);
      throw error;
    }
    this.cache = sources;
  }
}

function isConfigSource(value: unknown): value is ConfigSource {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.url === 'string';
}
