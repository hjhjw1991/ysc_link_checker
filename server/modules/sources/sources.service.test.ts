import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BUILTIN_SOURCES } from './builtin-sources';
import { CustomSourceStore } from './custom-source-store';
import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  let dir: string;
  let service: SourcesService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ysc-svc-'));
    service = new SourcesService(new CustomSourceStore(join(dir, 'custom-sources.json')));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('listAll 返回全部内置源和空的自定义源', () => {
    const { builtin, custom } = service.listAll();
    expect(builtin).toHaveLength(BUILTIN_SOURCES.length);
    expect(builtin.every((s) => s.origin === 'builtin' && s.id)).toBe(true);
    expect(custom).toEqual([]);
  });

  it('内置源的 id 在多次调用之间保持稳定', () => {
    expect(service.listAll().builtin.map((s) => s.id)).toEqual(service.listAll().builtin.map((s) => s.id));
  });

  it('导入新链接后出现在自定义列表里', () => {
    const result = service.importText('我的源,https://my-private.com/a.json');

    expect(result.added).toMatchObject([{ name: '我的源', url: 'https://my-private.com/a.json' }]);
    expect(result.duplicates).toEqual([]);
    expect(result.custom).toHaveLength(1);
    expect(service.listAll().custom).toHaveLength(1);
  });

  it('导入与内置源重复的链接会被判掉，并指出撞上了哪个内置源', () => {
    const builtin = BUILTIN_SOURCES[0];
    const result = service.importText(`抄来的,${builtin.url}`);

    expect(result.added).toEqual([]);
    expect(result.duplicates).toMatchObject([{ conflictWith: builtin.name }]);
    expect(service.listAll().custom).toEqual([]);
  });

  it('内置源的 gh-proxy 镜像写法同样会被判成重复', () => {
    const builtin = BUILTIN_SOURCES.find((s) => s.url.startsWith('https://'));
    expect(builtin).toBeDefined();

    const result = service.importText(`镜像,https://gh-proxy.com/${builtin!.url}`);

    expect(result.added).toEqual([]);
    expect(result.duplicates).toHaveLength(1);
  });

  it('重复导入同一条自定义源只会保留一条', () => {
    service.importText('https://my-private.com/a.json');
    const second = service.importText('https://my-private.com/a.json/');

    expect(second.added).toEqual([]);
    expect(second.duplicates).toHaveLength(1);
    expect(service.listAll().custom).toHaveLength(1);
  });

  it('无法识别的行进 invalid，不影响同批次里的合法行', () => {
    const result = service.importText('这是一句话\nhttps://my-private.com/a.json');

    expect(result.invalid).toEqual(['这是一句话']);
    expect(result.added).toHaveLength(1);
  });

  it('remove 能删掉自定义源', () => {
    const { added } = service.importText('https://my-private.com/a.json');

    expect(service.remove(added[0].id)).toBe(true);
    expect(service.listAll().custom).toEqual([]);
  });

  it('remove 拒绝删除内置源', () => {
    const builtinId = service.listAll().builtin[0].id;

    expect(service.remove(builtinId)).toBe(false);
    expect(service.listAll().builtin).toHaveLength(BUILTIN_SOURCES.length);
  });

  it('探测候选 = 内置源 + 自定义源，且整体去重', () => {
    service.importText('https://my-private.com/a.json');
    const candidates = service.getProbeCandidates();

    expect(candidates).toHaveLength(BUILTIN_SOURCES.length + 1);
    expect(candidates.at(-1)).toMatchObject({ url: 'https://my-private.com/a.json' });
  });

  it('探测候选保留内置源的 special 标记', () => {
    const candidates = service.getProbeCandidates();
    const specials = candidates.filter((c) => c.special);

    expect(specials.map((c) => c.special).sort()).toEqual(['github-readme', 'github-tree']);
  });
});
