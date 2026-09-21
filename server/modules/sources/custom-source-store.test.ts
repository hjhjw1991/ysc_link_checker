import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CustomSourceStore } from './custom-source-store';

describe('CustomSourceStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ysc-store-'));
    file = join(dir, 'nested', 'custom-sources.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('文件不存在时读出空列表', () => {
    expect(new CustomSourceStore(file).list()).toEqual([]);
  });

  it('写入的源能被新实例读回来', () => {
    const store = new CustomSourceStore(file);
    store.add([{ name: '我的源', url: 'https://a.com/x.json' }]);

    expect(new CustomSourceStore(file).list()).toMatchObject([
      { name: '我的源', url: 'https://a.com/x.json', origin: 'custom' },
    ]);
  });

  it('add 返回带 id 的记录，且 id 各不相同', () => {
    const store = new CustomSourceStore(file);
    const created = store.add([
      { name: 'A', url: 'https://a.com/x.json' },
      { name: 'B', url: 'https://b.com/y.json' },
    ]);

    expect(created).toHaveLength(2);
    expect(created[0].id).toBeTruthy();
    expect(created[0].id).not.toBe(created[1].id);
  });

  it('add 是追加，不会冲掉已有记录', () => {
    const store = new CustomSourceStore(file);
    store.add([{ name: 'A', url: 'https://a.com/x.json' }]);
    store.add([{ name: 'B', url: 'https://b.com/y.json' }]);

    expect(store.list().map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('remove 删掉指定 id 并返回 true', () => {
    const store = new CustomSourceStore(file);
    const [created] = store.add([{ name: 'A', url: 'https://a.com/x.json' }]);

    expect(store.remove(created.id)).toBe(true);
    expect(store.list()).toEqual([]);
    expect(new CustomSourceStore(file).list()).toEqual([]);
  });

  it('remove 不存在的 id 返回 false', () => {
    expect(new CustomSourceStore(file).remove('nope')).toBe(false);
  });

  it('文件内容损坏时退化成空列表而不是抛异常', () => {
    const store = new CustomSourceStore(file);
    store.add([{ name: 'A', url: 'https://a.com/x.json' }]);
    writeFileSync(file, '{ 这不是 JSON', 'utf-8');

    expect(new CustomSourceStore(file).list()).toEqual([]);
  });

  it('落盘内容是可读的 JSON 数组', () => {
    const store = new CustomSourceStore(file);
    store.add([{ name: 'A', url: 'https://a.com/x.json' }]);

    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ name: 'A', url: 'https://a.com/x.json' });
  });

  it('list 返回副本，外部改动不影响存储', () => {
    const store = new CustomSourceStore(file);
    store.add([{ name: 'A', url: 'https://a.com/x.json' }]);

    store.list()[0].name = '被改了';

    expect(store.list()[0].name).toBe('A');
  });
});
