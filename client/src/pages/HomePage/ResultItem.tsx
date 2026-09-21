import { Check, XCircle } from 'lucide-react';

import type { ProbeResultItem } from '@shared/api.interface';
import { healthStyle } from './health-style';

const TYPE_COLORS: Record<string, string> = {
  '影视配置': 'bg-blue-50 text-blue-700 border-blue-100',
  '多仓': 'bg-purple-50 text-purple-700 border-purple-100',
  '直播列表': 'bg-green-50 text-green-700 border-green-100',
  'JSON配置': 'bg-amber-50 text-amber-700 border-amber-100',
};

function formatSize(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface ResultItemProps {
  item: ProbeResultItem;
  copiedUrl: string | null;
  onCopy: (url: string) => void;
  index: number;
}

export function ResultItem({ item, copiedUrl, onCopy, index }: ResultItemProps) {
  const health = healthStyle(item.health, item.healthTier);

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm transition-all duration-300 ${
        item.available ? 'border-emerald-100 bg-white' : 'border-slate-100 bg-slate-50/40'
      }`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {item.available ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            )}
            <span className="truncate text-sm font-medium text-slate-900">
              {item.name}
            </span>
            {item.fromMultiWarehouse && (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                子源
              </span>
            )}
            <span
              className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${health.badge}`}
              title={item.healthReason}
            >
              {item.health} 分 · {health.label}
            </span>
          </div>

          <div className="mt-1.5 ml-5 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${health.bar}`} style={{ width: health.barWidth }} />
          </div>
          <div className="mt-1 ml-5 font-mono text-[11px] text-slate-500 break-all line-clamp-2">
            {item.url}
          </div>
          <div className="mt-2 ml-5 flex items-center gap-2 flex-wrap">
            {item.type && (
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[item.type] || 'bg-slate-50 text-slate-600 border-slate-100'}`}
              >
                {item.type}
              </span>
            )}
            {item.contentCount > 0 && (
              <span className="shrink-0 rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {item.contentCount} 条内容
              </span>
            )}
            <span className="text-[10px] text-slate-400">
              {item.responseTimeMs}ms · {formatSize(item.responseSizeBytes)}
            </span>
          </div>
          {!item.available && item.healthReason && (
            <div
              className={`mt-1.5 ml-5 text-[10px] ${item.healthTier === 'dead' ? 'text-slate-500' : 'text-amber-600'}`}
            >
              {item.healthReason}
            </div>
          )}
        </div>
        {item.available && (
          <button
            onClick={() => onCopy(item.url)}
            className="shrink-0 rounded-lg bg-emerald-50 p-2 text-emerald-600 transition-colors active:bg-emerald-100"
            aria-label="复制链接"
          >
            {copiedUrl === item.url ? (
              <Check className="h-4 w-4" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
