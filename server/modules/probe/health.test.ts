import { describe, expect, it } from 'vitest';

import { HEALTH_AVAILABLE_THRESHOLD, scoreHealth } from './health';

function body(text: string) {
  return Buffer.from(text, 'utf-8');
}

function score(text: string, over: { contentType?: string; responseTimeMs?: number } = {}) {
  return scoreHealth({
    body: body(text),
    contentType: over.contentType ?? 'text/plain',
    responseTimeMs: over.responseTimeMs ?? 1500,
  });
}

describe('scoreHealth —— 0 分：根本不是配置', () => {
  it('HTML 挑战页得 0 分', () => {
    const result = score('<!DOCTYPE html><html><head></head><body>请开启 JS</body></html>');
    expect(result).toMatchObject({ health: 0, tier: 'dead' });
    expect(result.reason).toContain('HTML');
  });

  it('content-type 为 text/html 时即便正文不像 HTML 也判 0 分', () => {
    expect(score('随便什么内容', { contentType: 'text/html; charset=utf-8' }).health).toBe(0);
  });

  it('PNG 等二进制内容得 0 分', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500)]);
    const result = scoreHealth({ body: png, contentType: 'image/png', responseTimeMs: 100 });

    expect(result).toMatchObject({ health: 0, tier: 'dead' });
    expect(result.reason).toContain('二进制');
  });

  it('content-type 是图片时不看正文直接判 0 分', () => {
    expect(score('看起来像文本', { contentType: 'image/jpeg' }).health).toBe(0);
  });

  it('响应体为空得 0 分', () => {
    expect(score('   ').health).toBe(0);
  });
});

describe('scoreHealth —— 40 分：能访问但不是配置', () => {
  it('空 JSON 对象', () => {
    const result = score('{}', { contentType: 'application/json' });
    expect(result).toMatchObject({ health: 40, tier: 'not-config', type: 'JSON配置' });
  });

  it('后端返回的错误 JSON', () => {
    expect(score('{"error":"not found","code":404}').health).toBe(40);
  });

  it('认不出条目的纯文本', () => {
    expect(score('这是一段说明文字，没有任何频道或接口。'.repeat(20)).health).toBe(40);
  });
});

describe('scoreHealth —— 60 分：配置合法但一条内容都没有', () => {
  it('sites 是空数组', () => {
    const result = score('{"sites":[],"spider":"x.jar"}');
    expect(result).toMatchObject({ health: 60, tier: 'empty-config', type: '影视配置', contentCount: 0 });
  });

  it('多仓的 urls 是空数组', () => {
    const result = score('{"urls":[]}');
    expect(result).toMatchObject({ health: 60, tier: 'empty-config', type: '多仓', contentCount: 0 });
  });
});

describe('scoreHealth —— 80 分以上：有真实内容', () => {
  it('影视配置按 sites + lives 计数', () => {
    const json = JSON.stringify({ sites: [{ key: 'a' }, { key: 'b' }], lives: [{ name: 'l' }] });
    const result = score(json);

    expect(result.tier).toBe('healthy');
    expect(result.type).toBe('影视配置');
    expect(result.contentCount).toBe(3);
    expect(result.health).toBeGreaterThanOrEqual(80);
  });

  it('多仓按子线路条数计数', () => {
    const json = JSON.stringify({ storeHouse: [{ url: 'a' }, { url: 'b' }] });
    const result = score(json);

    expect(result).toMatchObject({ type: '多仓', contentCount: 2, tier: 'healthy' });
  });

  it('m3u 列表按 #EXTINF 条数计数', () => {
    const m3u = '#EXTM3U\n#EXTINF:-1,CCTV1\nhttp://a/1\n#EXTINF:-1,CCTV2\nhttp://a/2\n';
    const result = score(m3u);

    expect(result).toMatchObject({ type: '直播列表', contentCount: 2, tier: 'healthy' });
  });

  it('「名称,地址」文本列表按行计数', () => {
    const txt = '央视,http://a/1\n卫视,http://a/2\n地方,http://a/3\n';
    expect(score(txt)).toMatchObject({ type: '直播列表', contentCount: 3, tier: 'healthy' });
  });

  it('内容越多分越高', () => {
    const few = score(JSON.stringify({ sites: Array.from({ length: 3 }, () => ({})) }));
    const many = score(JSON.stringify({ sites: Array.from({ length: 200 }, () => ({})) }));

    expect(many.health).toBeGreaterThan(few.health);
  });

  it('响应越快分越高', () => {
    const json = JSON.stringify({ sites: [{ key: 'a' }] });
    expect(score(json, { responseTimeMs: 200 }).health).toBeGreaterThan(
      score(json, { responseTimeMs: 6000 }).health,
    );
  });

  it('字段越完整分越高', () => {
    const bare = score(JSON.stringify({ sites: [{ key: 'a' }] }));
    const full = score(
      JSON.stringify({ sites: [{ key: 'a' }], spider: 'x.jar', parses: [{ name: 'p' }], lives: [] }),
    );

    expect(full.health).toBeGreaterThan(bare.health);
  });

  it('分数封顶 100', () => {
    const json = JSON.stringify({
      sites: Array.from({ length: 300 }, () => ({})),
      lives: [{ name: 'l' }],
      parses: [{ name: 'p' }],
      spider: 'x.jar',
    });

    expect(score(json, { responseTimeMs: 100 }).health).toBe(100);
  });
});

describe('scoreHealth —— 宽容解析', () => {
  it('缩进的 // 注释不影响解析（TS 版此前漏了 \\s*，把真配置误判成直播列表）', () => {
    const json = '{\n  "sites": [{"key":"a"}],\n    //////////\n    //肥猫\n  "spider": "x.jar"\n}';
    const result = score(json);

    expect(result.type).toBe('影视配置');
    expect(result.contentCount).toBe(1);
  });

  it('容忍尾逗号', () => {
    expect(score('{"sites":[{"key":"a"},],}').type).toBe('影视配置');
  });

  it('容忍字符串里的裸换行', () => {
    expect(score('{"sites":[{"name":"第一行\n第二行"}]}').type).toBe('影视配置');
  });
});

describe('可用门槛', () => {
  it('门槛是 80 分：有内容才算可用', () => {
    expect(HEALTH_AVAILABLE_THRESHOLD).toBe(80);
  });
});

describe('scoreHealth —— 注释开头的配置（真实源大量存在）', () => {
  it('文件以 // 注释开头时仍能解析出多仓', () => {
    const text = '//以下内容为互联网收集，只为自用。\n{ "storeHouse": [ { "sourceUrl": "http://a/b.txt" } ] }';
    const result = score(text);

    expect(result.type).toBe('多仓');
    expect(result.contentCount).toBe(1);
    expect(result.tier).toBe('healthy');
  });

  it('文件以 # 注释开头时同样能解析', () => {
    const result = score('# 说明\n{"sites":[{"key":"a"}]}');

    expect(result.type).toBe('影视配置');
  });

  it('注释开头但正文确实不是 JSON 的，仍然按文本列表处理', () => {
    const result = score('# 我的直播源\n央视,http://a/1\n卫视,http://a/2\n');

    expect(result).toMatchObject({ type: '直播列表', contentCount: 2 });
  });
});
