import { describe, expect, it } from 'vitest';

import { healthStyle } from './health-style';

describe('healthStyle', () => {
  it('完全不可用是灰色，不掺红', () => {
    const style = healthStyle(0, 'dead');

    expect(style.label).toBe('不可用');
    expect(style.badge).toContain('slate');
    expect(style.badge).not.toContain('rose');
  });

  it('40 分档偏红', () => {
    expect(healthStyle(40, 'not-config').badge).toContain('rose');
  });

  it('60 分档偏橙', () => {
    expect(healthStyle(60, 'empty-config').badge).toContain('amber');
  });

  it('80 出头是黄绿过渡色，不是满绿', () => {
    const style = healthStyle(82, 'healthy');

    expect(style.badge).toContain('lime');
    expect(style.badge).not.toContain('emerald');
  });

  it('90 分以上是绿色', () => {
    expect(healthStyle(95, 'healthy').badge).toContain('emerald');
  });

  it('分数越高，进度条越长', () => {
    expect(healthStyle(95, 'healthy').barWidth).toBe('95%');
    expect(healthStyle(0, 'dead').barWidth).toBe('0%');
  });

  it('每一档都有中文说明', () => {
    expect(healthStyle(0, 'dead').label).toBe('不可用');
    expect(healthStyle(40, 'not-config').label).toBe('非配置');
    expect(healthStyle(60, 'empty-config').label).toBe('空配置');
    expect(healthStyle(85, 'healthy').label).toBe('可用');
  });

  it('越界分数不会崩，按最近的档处理', () => {
    expect(healthStyle(120, 'healthy').barWidth).toBe('100%');
    expect(healthStyle(-5, 'dead').barWidth).toBe('0%');
  });
});
