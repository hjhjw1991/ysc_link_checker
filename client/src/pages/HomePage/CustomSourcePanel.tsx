import { useCallback, useState } from 'react';
import { Ban, Check, ChevronDown, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { sources as sourcesApi } from '@client/src/api';
import type { ConfigSource, ImportSourcesResponse } from '@shared/api.interface';
import { extractErrorMessage, summarizeImport } from './import-summary';

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

/** 导入结果里每类明细最多直接列出的条数，超出折叠 */
const PREVIEW_LIMIT = 5;

export function CustomSourcePanel({ customSources, onChange, disabled }: CustomSourcePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImportSourcesResponse | null>(null);

  const handleImport = useCallback(async () => {
    if (!text.trim()) {
      toast.error('请先粘贴要导入的链接');
      return;
    }
    setImporting(true);
    try {
      const result = await sourcesApi.importSources(text);
      onChange(result.custom);
      setLastResult(result);
      // 全部被丢弃时把原文留在输入框里，方便对着下面的明细改
      if (result.added.length > 0) setText('');

      const summary = summarizeImport(result);
      if (summary.tone === 'success') {
        toast.success(summary.text);
      } else {
        toast.warning(summary.text);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, '导入失败，请稍后重试'));
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
      } catch (error) {
        toast.error(extractErrorMessage(error, '删除失败，请稍后重试'));
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

          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-400">
            <p>
              每行一条：<span className="font-mono text-slate-500">链接</span> /{' '}
              <span className="font-mono text-slate-500">名称,链接</span> /{' '}
              <span className="font-mono text-slate-500">名称 链接</span>
              ；链接必须在行尾，<span className="font-mono text-slate-500">#</span> 与{' '}
              <span className="font-mono text-slate-500">//</span> 开头的行会被忽略。
            </p>
            <p>不符合格式的行会被丢弃并在下方列出；与内置源、已导入源重复的链接自动跳过。</p>
          </div>

          <button
            onClick={() => void handleImport()}
            disabled={importing || disabled}
            className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            导入
          </button>

          {lastResult && <ImportResultReport result={lastResult} onDismiss={() => setLastResult(null)} />}

          {customSources.length > 0 && (
            <ul className="mt-3 space-y-2">
              {customSources.map((source) => (
                <li key={source.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
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

/** 本次导入结果的常驻明细，toast 消失后仍然能看到哪几行出了问题 */
function ImportResultReport({
  result,
  onDismiss,
}: {
  result: ImportSourcesResponse;
  onDismiss: () => void;
}) {
  const summary = summarizeImport(result);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-xs font-semibold ${summary.tone === 'success' ? 'text-emerald-600' : 'text-amber-600'}`}
        >
          本次导入：{summary.text}
        </span>
        <button onClick={onDismiss} className="ml-auto text-[11px] text-slate-400">
          收起
        </button>
      </div>

      {result.added.length > 0 && (
        <ReportGroup
          icon={<Check className="h-3.5 w-3.5 text-emerald-500" />}
          title={`新增 ${result.added.length} 条`}
          lines={result.added.map((item) => `${item.name} — ${item.url}`)}
        />
      )}

      {result.duplicates.length > 0 && (
        <ReportGroup
          icon={<Ban className="h-3.5 w-3.5 text-amber-500" />}
          title={`重复跳过 ${result.duplicates.length} 条`}
          lines={result.duplicates.map((item) => `${item.url} —— 与「${item.conflictWith}」重复`)}
        />
      )}

      {result.invalid.length > 0 && (
        <ReportGroup
          icon={<XCircle className="h-3.5 w-3.5 text-rose-500" />}
          title={`格式不对已丢弃 ${result.invalid.length} 行`}
          lines={result.invalid}
        />
      )}
    </div>
  );
}

function ReportGroup({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? lines : lines.slice(0, PREVIEW_LIMIT);
  const rest = lines.length - visible.length;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
        {icon}
        {title}
      </div>
      <ul className="mt-1 space-y-0.5 pl-5">
        {visible.map((line, idx) => (
          <li key={`${idx}-${line}`} className="break-all font-mono text-[11px] leading-relaxed text-slate-500">
            {line}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button onClick={() => setShowAll(true)} className="mt-1 pl-5 text-[11px] text-indigo-500">
          还有 {rest} 条，展开
        </button>
      )}
    </div>
  );
}
