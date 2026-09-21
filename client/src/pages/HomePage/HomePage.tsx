import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, Zap, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { probe } from '@client/src/api';
import type { ProbeResponse, ProbeResultItem, ProbeProgressResponse } from '@shared/api.interface';
import { ProbeProgress } from './ProbeProgress';
import { ResultItem } from './ResultItem';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const POLL_INTERVAL_MS = 500;
const BUILTIN_SOURCE_COUNT = 19;

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProbeProgressResponse | null>(null);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async (taskId: string) => {
    try {
      const data = await probe.getProgress(taskId);
      setProgress(data);

      if (data.status === 'completed') {
        stopPolling();
        setResult({
          total: data.total,
          available: data.available,
          unavailable: data.unavailable,
          items: data.items,
          elapsedMs: data.elapsedMs,
        });
        setLoading(false);
      } else if (data.status === 'failed') {
        stopPolling();
        setLoading(false);
        toast.error(data.error || '检测失败');
      }
    } catch (error) {
      stopPolling();
      setLoading(false);
      toast.error('获取进度失败');
    }
  }, [stopPolling]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setProgress(null);
    setCopiedAll(false);
    try {
      const { taskId } = await probe.startProbe();
      pollTimerRef.current = window.setInterval(() => {
        void pollProgress(taskId);
      }, POLL_INTERVAL_MS);
      void pollProgress(taskId);
    } catch {
      toast.error('启动检测失败，请稍后重试');
      setLoading(false);
    }
  }, [pollProgress]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const handleCopy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  }, []);

  const handleCopyAll = useCallback(async () => {
    if (!result) return;
    const availableUrls = result.items
      .filter((item: ProbeResultItem) => item.available)
      .map((item: ProbeResultItem) => `${item.name}：${item.url}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(availableUrls);
      setCopiedAll(true);
      toast.success(`已复制 ${result.available} 条可用链接`);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  }, [result]);

  const displayItems = result?.items || progress?.items || [];
  const availableItems = displayItems.filter((item: ProbeResultItem) => item.available);
  const unavailableItems = displayItems.filter((item: ProbeResultItem) => !item.available);
  const showResultSection = (result != null) || (loading && displayItems.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-[480px] px-4 pt-5 pb-8">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">
            影视仓链接检测器
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            一键检测影视仓配置源可用性，复制即用
          </p>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              检测中，请稍候...
            </>
          ) : result ? (
            <>
              <RefreshCw className="h-5 w-5" />
              重新检测
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              开始检测
            </>
          )}
        </button>

        {loading && progress && (
          <ProbeProgress progress={progress} />
        )}

        {showResultSection && (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white p-3 shadow-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">
                  {result ? result.total : (progress?.total || 0)}
                </div>
                <div className="text-[11px] text-slate-500">总候选</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-600">
                  {result ? result.available : (progress?.available || 0)}
                </div>
                <div className="text-[11px] text-slate-500">可用</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-rose-500">
                  {result ? result.unavailable : (progress?.unavailable || 0)}
                </div>
                <div className="text-[11px] text-slate-500">不可用</div>
              </div>
            </div>

            {result && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  耗时 {formatDuration(result.elapsedMs)}
                </span>
                {result.available > 0 && (
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors active:bg-indigo-100"
                  >
                    {copiedAll ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    一键复制全部可用
                  </button>
                )}
              </div>
            )}

            {loading && displayItems.length > 0 && !result && (
              <div className="mt-3 text-[11px] text-slate-400">
                已完成 {progress?.completed || 0} 个，继续检测中...
              </div>
            )}

            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
              <AlertCircle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
              可用 = 链接可访问且内容为有效配置/列表。公益链接随时可能失效，以当次检测为准。
            </div>

            {availableItems.length > 0 && (
              <div className="mt-4">
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Check className="h-4 w-4 text-emerald-500" />
                  可用链接 ({availableItems.length})
                </h2>
                <div className="space-y-2.5">
                  {availableItems.map((item: ProbeResultItem, idx: number) => (
                    <ResultItem
                      key={`avail-${idx}-${item.url}`}
                      item={item}
                      copiedUrl={copiedUrl}
                      onCopy={handleCopy}
                      index={idx}
                    />
                  ))}
                </div>
              </div>
            )}

            {unavailableItems.length > 0 && (
              <div className="mt-5">
                <button
                  onClick={() => setShowUnavailable(!showUnavailable)}
                  className="mb-2 flex w-full items-center gap-1.5 text-sm font-medium text-slate-600"
                >
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
                    className="text-rose-400"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  不可用链接 ({unavailableItems.length})
                  <span className="ml-auto text-xs text-slate-400">
                    {showUnavailable ? '收起' : '展开'}
                  </span>
                </button>
                {showUnavailable && (
                  <div className="space-y-2">
                    {unavailableItems.map((item: ProbeResultItem, idx: number) => (
                      <ResultItem
                        key={`unavail-${idx}-${item.url}`}
                        item={item}
                        copiedUrl={copiedUrl}
                        onCopy={handleCopy}
                        index={idx}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!result && !loading && (
          <div className="mt-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
              <Zap className="h-10 w-10 text-indigo-400" />
            </div>
            <p className="text-sm text-slate-500">
              点击上方按钮开始检测
            </p>
            <p className="mt-1 text-xs text-slate-400">
              内置 {BUILTIN_SOURCE_COUNT} 个候选源，自动展开多仓子链接
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
