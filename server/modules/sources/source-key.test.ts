import { describe, expect, it } from 'vitest';

import { normalizeSourceKey } from './source-key';

describe('normalizeSourceKey', () => {
  it('把 gh-proxy 镜像地址和源地址归一成同一个 key', () => {
    const origin = 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/wx.json';
    expect(normalizeSourceKey('https://gh-proxy.com/' + origin)).toBe(normalizeSourceKey(origin));
  });

  it('忽略 scheme 与域名的大小写差异', () => {
    expect(normalizeSourceKey('HTTPS://Raw.GithubUserContent.com/a/b.json')).toBe(
      normalizeSourceKey('https://raw.githubusercontent.com/a/b.json'),
    );
  });

  it('忽略末尾斜杠', () => {
    expect(normalizeSourceKey('https://a.com/x.json/')).toBe(normalizeSourceKey('https://a.com/x.json'));
  });

  it('保留根路径，不会把域名本身的斜杠也吃掉', () => {
    expect(normalizeSourceKey('https://a.com/')).toBe(normalizeSourceKey('https://a.com'));
  });

  it('把中文域名转成 punycode 后再比对', () => {
    expect(normalizeSourceKey('http://www.饭太硬.net/tv')).toBe(
      normalizeSourceKey('http://www.xn--sss604efuw.net/tv'),
    );
  });

  it('忽略默认端口', () => {
    expect(normalizeSourceKey('https://a.com:443/x.json')).toBe(normalizeSourceKey('https://a.com/x.json'));
  });

  it('忽略 hash 片段', () => {
    expect(normalizeSourceKey('https://a.com/x.json#frag')).toBe(normalizeSourceKey('https://a.com/x.json'));
  });

  it('保留查询串差异（宁可错放，不要多删）', () => {
    expect(normalizeSourceKey('http://x.com/api.json?id=1')).not.toBe(
      normalizeSourceKey('http://x.com/api.json?id=2'),
    );
  });

  it('区分 http 与 https，二者可能是不同站点', () => {
    expect(normalizeSourceKey('http://a.com/x.json')).not.toBe(normalizeSourceKey('https://a.com/x.json'));
  });

  it('区分路径大小写，路径本身大小写敏感', () => {
    expect(normalizeSourceKey('https://a.com/X.json')).not.toBe(normalizeSourceKey('https://a.com/x.json'));
  });

  it('无法解析的串退回原文小写，绝不与其他串合并', () => {
    expect(normalizeSourceKey('  不是链接  ')).toBe('不是链接');
    expect(normalizeSourceKey('不是链接')).not.toBe(normalizeSourceKey('也不是链接'));
  });

  it('只剥一次 gh-proxy 前缀，后面不是 http 开头就不动它', () => {
    expect(normalizeSourceKey('https://gh-proxy.com/foo/bar.json')).not.toBe(
      normalizeSourceKey('https://foo/bar.json'),
    );
  });
});
