import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type { StartProbeResponse, ProbeProgressResponse } from '@shared/api.interface';

export async function startProbe(): Promise<StartProbeResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/probe',
      method: 'POST',
    });
    return response.data;
  } catch (error) {
    logger.error('启动探测失败', error);
    throw error;
  }
}

export async function getProgress(taskId: string): Promise<ProbeProgressResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/probe/${taskId}`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取探测进度失败', error);
    throw error;
  }
}
