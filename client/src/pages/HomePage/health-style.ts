import type { HealthTier } from '@shared/api.interface';

export interface HealthStyle {
  /** 徽标的底色 + 文字色 */
  badge: string;
  /** 进度条填充色 */
  bar: string;
  /** 进度条宽度，如 '85%' */
  barWidth: string;
  label: string;
}

/**
 * 健康度配色：分数越高越绿，越低越红，完全不可用是灰色（灰表示「没连上/不是配置」，
 * 跟「连上了但质量差」的红区分开）。
 */
export function healthStyle(health: number, tier: HealthTier): HealthStyle {
  const clamped = Math.max(0, Math.min(100, health));
  const barWidth = `${clamped}%`;

  if (tier === 'dead') {
    return { badge: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300', barWidth, label: '不可用' };
  }
  if (tier === 'not-config') {
    return { badge: 'bg-rose-50 text-rose-600', bar: 'bg-rose-400', barWidth, label: '非配置' };
  }
  if (tier === 'empty-config') {
    return { badge: 'bg-amber-50 text-amber-600', bar: 'bg-amber-400', barWidth, label: '空配置' };
  }
  // healthy：80 出头先走黄绿过渡，90 以上才给满绿，避免「勉强及格」看起来跟「优秀」一样
  if (clamped < 90) {
    return { badge: 'bg-lime-50 text-lime-700', bar: 'bg-lime-400', barWidth, label: '可用' };
  }
  return { badge: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', barWidth, label: '可用' };
}
