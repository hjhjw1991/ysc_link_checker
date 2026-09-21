import { useCallback, useState } from 'react';
import { ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { sources as sourcesApi } from '@client/src/api';
import type { ConfigSource, ImportSourcesResponse } from '@shared/api.interface';

interface CustomSourcePanelProps {
  customSources: ConfigSource[];
  /** 导入或删除后把最新的自定义源列表回传给页面 */
  onChange: (custom: ConfigSource[]) => void;
  disabled: boolean;
}

const PLACEHOLDER = `每行一条，支持三种写法：
https://example.com/tv.json
我的多仓,https://example.com/dc.json
儿童专线 https://example.com/kids.txt

# 和 // 开头的行会被忽略`;

export function CustomSourcePanel({ customSources, onChange, disabled }: CustomSourcePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!text.trim()) {
      toast.error('请先粘贴要导入的链接');
      return;
    }
    setImporting(true);
    try {
      const result: ImportSourcesResponse = await sourcesApi.importSources(text);
      onChange(result.custom);
      setText('');
      toast.success(summarizeImport(result));
    } catch {
      toast.error('导入失败，请稍后重试');
    } finally {
      setImporting(false);
    }
  }, [text, onChange]);

  const handleRemove = useCallback(
    async (source: ConfigSource) => {
      setRemovingId(source.id);
      try {
        await sourcesApi.removeSource(source.id);
        onChange(customSources.filter((item) => item.id !== source.id));
        toast.success(`已删除「${source.name}」`);
      } catch {
        toast.error('删除失败，请稍后重试');
      } finally {
        setRemovingId(null);
      }
    },
    [customSources, onChange],
  );

  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700"
      >
        <Plus className="h-4 w-4 text-indigo-500" />
        自定义源
        {customSources.length > 0 && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
            {customSources.length}
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={6}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />

          <button
            onClick={handleImport}
            disabled={importing || disabled}
            className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            导入
          </button>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            与内置源、已导入源重复的链接会自动跳过（gh-proxy 镜像、末尾斜杠、中文域名视为同一条）。
          </p>

          {customSources.length > 0 && (
            <ul className="mt-3 space-y-2">
              {customSources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-700">{source.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-400">{source.url}</div>
                  </div>
                  <button
                    onClick={() => void handleRemove(source)}
                    disabled={removingId === source.id}
                    aria-label={`删除 ${source.name}`}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors active:bg-rose-50 active:text-rose-500 disabled:opacity-50"
                  >
                    {removingId === source.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeImport(result: ImportSourcesResponse): string {
  const parts = [`新增 ${result.added.length} 条`];
  if (result.duplicates.length > 0) parts.push(`${result.duplicates.length} 条重复已跳过`);
  if (result.invalid.length > 0) parts.push(`${result.invalid.length} 行无法识别`);
  return parts.join('，');
}
