#!/usr/bin/env node
/**
 * 本地独立开发启动脚本（不依赖 Lark aPaaS 沙箱 / lark-cli / miaoda-cli）。
 *
 * 与平台自带的 scripts/dev.sh 区别：
 *   - 不跑 `miaoda app sync` / `lark-cli env pull` / `skills sync`；
 *   - 只做两件事：把 .env 加载进 process.env，然后并发拉起 dev:server + dev:client。
 *
 * NestJS 监听 SERVER_PORT(3000)，Vite dev server 监听 CLIENT_DEV_PORT(8080)
 * 并把 /api 与 HTML 请求反代到 NestJS，所以浏览器只需打开 8080。
 */
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

// Vite preset 只有在 MIAODA_APP_TYPE==='3' 时才挂 fullstack 套件（/api 反代 + HTML 反代
// 到 NestJS + csrf 头注入），否则 8080 上所有请求都是 404。
process.env.MIAODA_APP_TYPE ||= '3';
// 平台注入项的本地兜底，缺一个 Nest 就起不来。
process.env.FORCE_AUTHN_INNERAPI_DOMAIN ||= 'http://127.0.0.1:1';
process.env.DEPRECATED_SKIP_INIT_DB_CONNECTION ||= 'true';
process.env.NODE_ENV ||= 'development';

const SERVER_PORT = process.env.SERVER_PORT || '3000';
const CLIENT_DEV_PORT = process.env.CLIENT_DEV_PORT || '8080';

const children = [];

function start(name, args) {
  const child = spawn('npm', ['run', args], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${name}] `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(tag + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${tag}退出，code=${code}\n`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* 已退出 */ }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('server', 'dev:server');
start('client', 'dev:client');

process.stdout.write(
  `\n👉 前端(带 HMR): http://localhost:${CLIENT_DEV_PORT}\n` +
  `👉 后端 API:     http://localhost:${SERVER_PORT}/api/probe\n\n`,
);
