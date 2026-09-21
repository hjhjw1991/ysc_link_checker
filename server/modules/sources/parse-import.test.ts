import { describe, expect, it } from 'vitest';

import { parseImportText } from './parse-import';

describe('parseImportText', () => {
  it('每行一条裸链接', () => {
    const { entries, invalid } = parseImportText('https://a.com/x.json\nhttps://b.com/y.txt');
    expect(entries.map((e) => e.url)).toEqual(['https://a.com/x.json', 'https://b.com/y.txt']);
    expect(invalid).toEqual([]);
  });

  it('支持「名称,链接」写法', () => {
    const { entries } = parseImportText('月光宝盒,https://a.com/x.json');
    expect(entries).toEqual([{ name: '月光宝盒', url: 'https://a.com/x.json' }]);
  });

  it('支持「名称<空格>链接」和制表符分隔', () => {
    const { entries } = parseImportText('影视仓 https://a.com/x.json\n直播源\thttps://b.com/y.txt');
    expect(entries).toEqual([
      { name: '影视仓', url: 'https://a.com/x.json' },
      { name: '直播源', url: 'https://b.com/y.txt' },
    ]);
  });

  it('名称里带空格和逗号也能正确切出链接', () => {
    const { entries } = parseImportText('我的 私藏, 多仓 https://a.com/x.json');
    expect(entries).toEqual([{ name: '我的 私藏, 多仓', url: 'https://a.com/x.json' }]);
  });

  it('没写名称时用域名和文件名兜底', () => {
    const { entries } = parseImportText('https://a.com/path/x.json');
    expect(entries).toEqual([{ name: 'a.com/x.json', url: 'https://a.com/path/x.json' }]);
  });

  it('路径为空时退回域名当名称', () => {
    const { entries } = parseImportText('https://a.com');
    expect(entries).toEqual([{ name: 'a.com', url: 'https://a.com' }]);
  });

  it('跳过空行、# 注释和 // 注释', () => {
    const { entries, invalid } = parseImportText(
      '# 我的源\n\n  \nhttps://a.com/x.json\n// 停用\n//https://b.com/y.txt',
    );
    expect(entries.map((e) => e.url)).toEqual(['https://a.com/x.json']);
    expect(invalid).toEqual([]);
  });

  it('非 http(s) 的行进 invalid，不进 entries', () => {
    const { entries, invalid } = parseImportText('ftp://a.com/x.json\n这是一句话\nhttps://ok.com/z.json');
    expect(entries.map((e) => e.url)).toEqual(['https://ok.com/z.json']);
    expect(invalid).toEqual(['ftp://a.com/x.json', '这是一句话']);
  });

  it('容忍 CRLF 换行和行尾空白', () => {
    const { entries } = parseImportText('https://a.com/x.json  \r\nhttps://b.com/y.txt\r\n');
    expect(entries.map((e) => e.url)).toEqual(['https://a.com/x.json', 'https://b.com/y.txt']);
  });

  it('空输入返回空结果', () => {
    expect(parseImportText('')).toEqual({ entries: [], invalid: [] });
    expect(parseImportText('   \n\n  ')).toEqual({ entries: [], invalid: [] });
  });

  it('同一行出现两个链接时取最后一个作为 URL', () => {
    const { entries } = parseImportText('见 https://doc.com/说明 https://a.com/x.json');
    expect(entries).toEqual([{ name: '见 https://doc.com/说明', url: 'https://a.com/x.json' }]);
  });
});
