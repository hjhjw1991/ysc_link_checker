import { describe, expect, it } from 'vitest';

import { SourceDeduper, dedupeCandidates, dedupeIncoming } from './dedupe';

describe('SourceDeduper', () => {
  it('首次出现的链接可以加入，重复的被拒绝', () => {
    const deduper = new SourceDeduper();
    expect(deduper.tryAdd('https://a.com/x.json')).toBe(true);
    expect(deduper.tryAdd('https://a.com/x.json')).toBe(false);
  });

  it('按归一化 key 判重，镜像地址会被认成同一条', () => {
    const deduper = new SourceDeduper();
    const origin = 'https://raw.githubusercontent.com/w/r/a.json';
    expect(deduper.tryAdd(origin)).toBe(true);
    expect(deduper.tryAdd('https://gh-proxy.com/' + origin)).toBe(false);
  });

  it('构造时可以预置一批已存在的链接', () => {
    const deduper = new SourceDeduper(['https://a.com/x.json']);
    expect(deduper.tryAdd('https://a.com/x.json/')).toBe(false);
    expect(deduper.tryAdd('https://b.com/y.json')).toBe(true);
  });

  it('has 只查询不写入', () => {
    const deduper = new SourceDeduper();
    expect(deduper.has('https://a.com/x.json')).toBe(false);
    expect(deduper.tryAdd('https://a.com/x.json')).toBe(true);
    expect(deduper.has('https://a.com/x.json')).toBe(true);
  });
});

describe('dedupeIncoming', () => {
  const existing = [
    { name: '无邪多仓', url: 'https://raw.githubusercontent.com/w/r/wx.json' },
    { name: '月光宝盒', url: 'https://jihulab.com/y/box/raw/main/dc.json' },
  ];

  it('全新的链接进 added', () => {
    const result = dedupeIncoming(existing, [{ name: '新源', url: 'https://new.com/a.json' }]);
    expect(result.added).toEqual([{ name: '新源', url: 'https://new.com/a.json' }]);
    expect(result.duplicates).toEqual([]);
  });

  it('与已有源重复的进 duplicates，并指出撞上了谁', () => {
    const result = dedupeIncoming(existing, [
      { name: '我抄的', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/w/r/wx.json' },
    ]);
    expect(result.added).toEqual([]);
    expect(result.duplicates).toEqual([
      {
        name: '我抄的',
        url: 'https://gh-proxy.com/https://raw.githubusercontent.com/w/r/wx.json',
        conflictWith: '无邪多仓',
      },
    ]);
  });

  it('同一批粘贴内部的重复也会被判掉，保留先出现的那条', () => {
    const result = dedupeIncoming(
      [],
      [
        { name: '第一次', url: 'https://a.com/x.json' },
        { name: '第二次', url: 'https://a.com/x.json/' },
      ],
    );
    expect(result.added).toEqual([{ name: '第一次', url: 'https://a.com/x.json' }]);
    expect(result.duplicates).toEqual([
      { name: '第二次', url: 'https://a.com/x.json/', conflictWith: '第一次' },
    ]);
  });

  it('不修改传入的已有源数组', () => {
    const snapshot = JSON.parse(JSON.stringify(existing));
    dedupeIncoming(existing, [{ name: '新源', url: 'https://new.com/a.json' }]);
    expect(existing).toEqual(snapshot);
  });
});

describe('dedupeCandidates', () => {
  it('过滤掉已经在池子里的候选，并把新的登记进去', () => {
    const deduper = new SourceDeduper(['https://a.com/x.json']);

    const kept = dedupeCandidates(deduper, [
      { name: '已探测过', url: 'https://a.com/x.json' },
      { name: '新的', url: 'https://b.com/y.json' },
    ]);

    expect(kept).toEqual([{ name: '新的', url: 'https://b.com/y.json' }]);
    expect(deduper.has('https://b.com/y.json')).toBe(true);
  });

  it('同一批展开结果内部的重复只保留第一条', () => {
    const deduper = new SourceDeduper();

    const kept = dedupeCandidates(deduper, [
      { name: '多仓A的子线路', url: 'https://shared.com/z.json' },
      { name: '多仓B的同一条', url: 'https://shared.com/z.json/' },
    ]);

    expect(kept).toEqual([{ name: '多仓A的子线路', url: 'https://shared.com/z.json' }]);
  });

  it('空输入返回空数组', () => {
    expect(dedupeCandidates(new SourceDeduper(), [])).toEqual([]);
  });
});
