export type ProbeResultType =
  | '影视配置'
  | '多仓'
  | '直播列表'
  | 'JSON配置';

/**
 * 健康度分档：
 *   dead(0)          完全不可用——连不通、HTML 挑战页、二进制文件
 *   not-config(40)   能访问，但认不出是配置
 *   empty-config(60) 配置结构合法，但里面一条内容都没有
 *   healthy(80~100)  有真实内容，按内容规模/响应速度/字段完整度加分
 */
export type HealthTier = 'dead' | 'not-config' | 'empty-config' | 'healthy';

export interface ProbeResultItem {
  name: string;
  url: string;
  /** health >= 80，即「结构合法且真的有内容」 */
  available: boolean;
  /** 0~100 的健康度得分 */
  health: number;
  healthTier: HealthTier;
  /** 配置里真实可用的条目数：影视配置数 sites+lives，多仓数子线路，列表数频道 */
  contentCount: number;
  /** 得分的一句话解释，可用与不可用都有 */
  healthReason: string;
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
