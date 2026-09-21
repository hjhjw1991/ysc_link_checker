export type ProbeResultType =
  | '影视配置'
  | '多仓'
  | '直播列表'
  | 'JSON配置';

export interface ProbeResultItem {
  name: string;
  url: string;
  available: boolean;
  type?: ProbeResultType;
  statusCode?: number;
  responseTimeMs: number;
  responseSizeBytes?: number;
  errorReason?: string;
  fromMultiWarehouse?: boolean;
}

export interface ProbeResponse {
  total: number;
  available: number;
  unavailable: number;
  items: ProbeResultItem[];
  elapsedMs: number;
}

export interface StartProbeResponse {
  taskId: string;
}

export type ProbeTaskStatus = 'running' | 'completed' | 'failed';

export interface ProbeProgressResponse {
  taskId: string;
  status: ProbeTaskStatus;
  total: number;
  completed: number;
  available: number;
  unavailable: number;
  currentItemName?: string;
  currentItemUrl?: string;
  items: ProbeResultItem[];
  elapsedMs: number;
  error?: string;
}
