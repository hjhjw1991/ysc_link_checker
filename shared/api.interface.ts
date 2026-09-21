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

// ---------------------------------------------------------------- 配置源管理

export type SourceOrigin = 'builtin' | 'custom';

export interface ConfigSource {
  id: string;
  name: string;
  url: string;
  origin: SourceOrigin;
}

export interface ListSourcesResponse {
  builtin: ConfigSource[];
  custom: ConfigSource[];
}

export interface ImportSourcesRequest {
  /** 用户粘贴的原始文本，每行一条：`URL` 或 `名称,URL` / `名称 URL` */
  text: string;
}

export interface DuplicateSourceInfo {
  name: string;
  url: string;
  /** 撞上的那条已有源的名称 */
  conflictWith: string;
}

export interface ImportSourcesResponse {
  added: ConfigSource[];
  duplicates: DuplicateSourceInfo[];
  /** 无法识别成 http(s) 链接的原始行 */
  invalid: string[];
  /** 导入后的完整自定义源列表，前端直接替换本地状态 */
  custom: ConfigSource[];
}
