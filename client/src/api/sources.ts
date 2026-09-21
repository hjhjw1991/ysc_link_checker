import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type { ImportSourcesResponse, ListSourcesResponse } from '@shared/api.interface';

export async function listSources(): Promise<ListSourcesResponse> {
  try {
    const response = await axiosForBackend({ url: '/api/sources', method: 'GET' });
    return response.data;
  } catch (error) {
    logger.error('获取配置源列表失败', error);
    throw error;
  }
}

export async function importSources(text: string): Promise<ImportSourcesResponse> {
  try {
    const response = await axiosForBackend({ url: '/api/sources', method: 'POST', data: { text } });
    return response.data;
  } catch (error) {
    logger.error('导入配置源失败', error);
    throw error;
  }
}

export async function removeSource(id: string): Promise<void> {
  try {
    await axiosForBackend({ url: `/api/sources/${id}`, method: 'DELETE' });
  } catch (error) {
    logger.error('删除配置源失败', error);
    throw error;
  }
}
