import path from 'path';
import { defineConfig } from 'vitest/config';

// 只跑服务端纯逻辑的单元测试（去重归一化、导入文本解析）。
// 组件测试不在范围内，所以没有 jsdom 环境依赖。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
