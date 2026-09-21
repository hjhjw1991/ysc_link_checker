import { Loader2 } from 'lucide-react';

import type { ProbeProgressResponse } from '@shared/api.interface';

interface ProbeProgressProps {
  progress: ProbeProgressResponse;
}

export function ProbeProgress({ progress }: ProbeProgressProps) {
  const total = progress.total || 19;
  const percent = total > 0 ? Math.min(Math.round((progress.completed / total) * 100), 99) : 0;

  return (
    <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          <span className="text-sm font-medium text-slate-700">检测进行中</span>
        </div>
        <span className="text-sm font-semibold text-indigo-600">
          {progress.completed} / {total}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>已完成 {percent}%</span>
        <span>可用 {progress.available} · 不可用 {progress.unavailable}</span>
      </div>

      {progress.currentItemName && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo-500" />
            <span className="truncate text-xs font-medium text-slate-700">
              {progress.currentItemName}
            </span>
          </div>
          <div className="mt-0.5 ml-3 font-mono text-[10px] text-slate-400 truncate">
            {progress.currentItemUrl}
          </div>
        </div>
      )}
    </div>
  );
}
