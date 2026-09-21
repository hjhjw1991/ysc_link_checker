#!/usr/bin/env node
/**
 * 本地独立构建脚本（不依赖 Lark aPaaS 沙箱工具链）。
 *
 * 与平台自带的 scripts/build.sh 区别：
 *   - 不跑 `fullstack-cli action-plugin init` / `generate-api-routes` 等平台专用步骤；
 *   - 产物按「cwd = 仓库根目录」组织：NestJS 的 setBaseViewsDir 指向 <root>/dist/client，
 *     所以入口 HTML 必须落在 dist/client/index.html（Vite 默认输出到 dist/client/client/）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

// Vite preset 的 fullstack 套件（含把入口 HTML 写到 NestJS 视图目录的 htmlOutputPlugin）
// 只在 MIAODA_APP_TYPE==='3' 时启用。
process.env.MIAODA_APP_TYPE ||= '3';

const DIST = path.join(ROOT, 'dist');
const VIEWS = path.join(DIST, 'client');

function run(cmd, args, env) {
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, ...env } });
}

console.log('🗑️  清理 dist/');
fs.rmSync(DIST, { recursive: true, force: true });

console.log('🔨 构建 server (nest + swc)');
run('npx', ['nest', 'build'], { NODE_ENV: 'production' });

console.log('🔨 构建 client (vite)');
run('npx', ['vite', 'build', '--config', 'vite.config.ts'], { NODE_ENV: 'production' });

console.log('📦 整理产物：把入口 HTML 放到视图目录');
// client/public 下的静态文件（favicon 等）先落到视图目录
const PUBLIC = path.join(ROOT, 'client', 'public');
if (fs.existsSync(PUBLIC)) {
  fs.cpSync(PUBLIC, VIEWS, { recursive: true });
}
// Vite 把 HTML 输出在 dist/client/client/ 下，移到 dist/client/ 覆盖 public 同名文件
const HTML_SRC = path.join(VIEWS, 'client');
if (fs.existsSync(HTML_SRC)) {
  for (const f of fs.readdirSync(HTML_SRC)) {
    if (f.endsWith('.html')) fs.renameSync(path.join(HTML_SRC, f), path.join(VIEWS, f));
  }
  fs.rmSync(HTML_SRC, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(VIEWS, 'index.html'))) {
  console.error('❌ 未找到 dist/client/index.html，构建产物不完整');
  process.exit(1);
}
console.log('✅ 构建完成：npm run start:local 启动');
