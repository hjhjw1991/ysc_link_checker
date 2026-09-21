# 影视仓链接检测器 (YSC Link Checker)

影视仓 / 电视盒子「资源推送配置链接」可用性检测工具。自动收集全网公开的配置源（含多仓自动展开、
GitHub 接口仓库枚举），逐条做**内容级**探测，只留下真正能用的链接。

仓库包含两种形态：

| 形态 | 位置 | 适合 |
| --- | --- | --- |
| **Web 应用**（移动端优先，一键检测 + 一键复制） | 仓库根目录 | 日常使用，手机浏览器打开即可 |
| **命令行脚本**（纯 Python 标准库，零依赖） | `cli/` | 服务器 / Termux / 不想装 Node 的场景 |

两者检测逻辑一致，数据源同源。

---

## 一、Web 应用

### 技术栈

- 后端：NestJS 10 + Axios（在服务端并发探测，绕开浏览器 CORS 限制）
- 前端：React 19 + Vite + Tailwind + Radix UI，移动端单列布局
- 无数据库、无登录

### 本地运行

要求 Node >= 22、npm >= 10。

```bash
npm install

# 方式 A：开发模式（前端 HMR）
npm run dev:local        # 浏览器打开 http://localhost:8080

# 方式 B：生产模式（单端口，NestJS 直出前端产物）
npm run build:local
npm run start:local      # 浏览器打开 http://localhost:3000
```

> 两种模式都会写 `dist/client/index.html`：`dev:local` 写的是开发版（引用 Vite 的模块地址），
> 所以**跑过 `dev:local` 之后要用生产模式，必须重新 `npm run build:local`**。

端口可通过 `.env` 里的 `SERVER_PORT` / `CLIENT_DEV_PORT` 调整。

### 测试

```bash
npm test          # vitest，覆盖去重归一化 / 导入解析 / 存储 / 配置源服务
npm run type:check
npm run eslint
```

### 自定义配置源

页面「开始检测」下方有折叠面板「自定义源」，粘贴文本即可导入，每行一条：

```
https://example.com/tv.json
我的多仓,https://example.com/dc.json
儿童专线 https://example.com/kids.txt
# 和 // 开头的行会被忽略
```

没写名称时自动用「域名/文件名」兜底。导入的源落盘在 `data/custom-sources.json`
（路径可用 `CUSTOM_SOURCES_FILE` 覆盖），重启不丢，可逐条删除；内置源不可删。

**格式不对的行会被丢弃并逐行列出**——没有 http(s) 链接、或链接不在行尾（如
`https://a.com/x.json 备注`）都算不合格式。导入后面板里会留一块结果明细：新增了哪几条、
哪几条重复（含撞上的是哪一条源）、哪几行被丢弃，每类超过 5 条折叠。只要一条都没加进去，
提示就是黄色警告而不是绿色成功，且原文保留在输入框里方便对着明细改。

**去重**：导入时与内置源、已导入源比对，重复的跳过并告诉你撞上了哪一条；探测时一级候选与
二级展开结果（多仓子线路 / README 链接 / GitHub tree 文件）共用同一个去重池，同一个链接
全程只探测一次。实测一次检测的二级展开 82 条候选去重后只剩 59 条。

判重按归一化后的 key 比对，口径刻意保守——「宁可错放，不要多删」：

| 视为同一条 | 保持区分 |
| --- | --- |
| gh-proxy 镜像地址 与 源地址 | `http` 与 `https` |
| scheme / 域名大小写 | 路径大小写 |
| 末尾多余的 `/`、默认端口、`#hash` | 查询串 `?a=1` |
| 中文域名 与 其 punycode 写法 | 解析失败的串（只跟字面完全相同的合并） |

### 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/probe` | 发起一次检测，立即返回 `{ taskId }`，探测在后台跑 |
| `GET` | `/api/probe/:taskId` | 轮询进度与结果（`items[]` 每项带 `health` / `healthTier` / `contentCount` / `healthReason`） |
| `GET` | `/api/sources` | 列出内置源与自定义源 |
| `POST` | `/api/sources` | 导入，body `{ text }`，返回 `{ added, duplicates, invalid, custom }` |
| `DELETE` | `/api/sources/:id` | 删除一条自定义源（内置源返回 404） |

接口受框架的 CSRF double-submit 保护：请求需同时带 cookie `suda-csrf-token` 和同值的请求头
`x-suda-csrf-token`（页面里由前端自动处理）。用 curl 手测：

```bash
CSRF=$(curl -s -c /tmp/cj http://localhost:3000/ | grep -oE 'csrfToken = "[^"]*"' | sed 's/.*"\(.*\)"/\1/')
TID=$(curl -s -b /tmp/cj -H "x-suda-csrf-token: $CSRF" -X POST http://localhost:3000/api/probe | python3 -c 'import sys,json;print(json.load(sys.stdin)["taskId"])')
sleep 25
curl -s -b /tmp/cj -H "x-suda-csrf-token: $CSRF" "http://localhost:3000/api/probe/$TID"
```

返回结构定义见 `shared/api.interface.ts`。

### 目录结构

```
server/modules/probe/     探测服务（并发探测、多仓展开）
server/modules/probe/health.ts  健康度打分：内容识别、条目计数、分档与加分
server/modules/sources/   配置源管理：内置清单、导入解析、去重、落盘存储
server/modules/view/      SPA 入口页渲染
server/common/middlewares/ 本地独立运行所需的两个中间件（见下）
shared/api.interface.ts   前后端共享类型
client/src/pages/HomePage/ 页面主体（操作区 / 自定义源面板 / 进度 / 结果列表）
client/src/api/probe.ts   接口封装
cli/                      Python 命令行版
```

### 关于「脱离 Lark aPaaS 平台本地运行」

这套代码原本生成自 Lark aPaaS（妙搭）全栈模板，默认假设跑在平台沙箱里。要在本地裸跑，做了
以下改动，全部**只在本地模式生效，平台部署行为不变**：

1. `.env` 增加 4 个平台注入项的本地兜底：
   - `FORCE_AUTHN_INNERAPI_DOMAIN`：平台 HTTP 客户端强制要求基础域名，本项目不调平台内部
     API，占位即可；
   - `DEPRECATED_SKIP_INIT_DB_CONNECTION=true`：本项目无数据库，跳过 DataPaaS 连接初始化；
   - `LOCAL_STANDALONE=1`：见第 2、3 点；
   - `SERVER_PORT` / `CLIENT_DEV_PORT`。
2. `server/common/middlewares/local-standalone.middleware.ts`：补一个 `x-miaoda-custom-host`
   请求头。框架据此把前端路由 basename 从 `/app/<appId>` 改回 `/`，否则 react-router 报
   `<Router basename="/app/"> is not able to match the URL "/"` 并渲染出空白页。
3. `server/common/middlewares/local-assets.middleware.ts`：直出 `dist/client/assets/*`。平台上
   这些带 hash 的产物走 CDN，框架自带的静态中间件**明确跳过** `assets/` 前缀，本地没有 CDN
   就会落到 SPA catch-all 路由上返回 HTML，浏览器报 MIME 错误、页面白屏。
4. `scripts/dev-local-standalone.js` / `scripts/build-local.js`：替代平台自带的 `scripts/dev.sh`
   和 `scripts/build.sh`（那两个依赖 `lark-cli` / `miaoda-cli` / `fullstack-cli`，本地没有）。
   两个脚本都会设 `MIAODA_APP_TYPE=3`，否则 Vite preset 不挂 fullstack 套件，8080 上的 `/api`
   反代和 HTML 反代全部 404。
5. 移除了 `package.json` 的 `postinstall: fullstack-cli action-plugin init`（该命令是平台沙箱
   专用，本地 `npm install` 会直接失败）。

平台自带的 `npm run dev` / `npm run build` / `npm run start` 原样保留，回到平台上照常可用。

已知无害噪音：浏览器控制台会有 `Failed to init time offset` / `Error fetching published app info`
/ `Log export failed` —— 都是 client-toolkit 在找平台 runtime 接口和字节 APM 上报，本地没有，
不影响功能。

---

## 二、Python 命令行版

```bash
python3 cli/ysc_link_checker.py
```

Windows 可直接双击 `cli/一键检测.bat`。

可选参数：

| 参数 | 说明 |
| --- | --- |
| `--timeout 10` | 单个链接超时秒数（默认 10） |
| `--workers 12` | 并发线程数（默认 12） |
| `--extra URL` | 额外追加检测链接（可多次） |
| `--no-dynamic` | 不展开多仓 / 不抓 GitHub，只检测内置列表 |
| `--out 文件名` | 自定义输出文件名 |

运行结束生成 `影视仓可用链接_日期_时间.txt`（可直接复制进影视仓「配置地址」）和
`检测明细_日期_时间.json`（含失败原因）。

特点：纯标准库零依赖、支持中文域名（punycode）与中文路径转义、GitHub 源失败自动走 gh-proxy
镜像重试、宽容解析民间配置（`//` 与 `#` 注释、尾逗号、字符串内裸换行）。

---

## 三、检测逻辑

1. **收集候选**：17 个内置直连源 + 2 个 GitHub 汇总源——接口大全仓库（正则提取 README 里全部
   链接）与配置库（GitHub API 递归枚举仓库内 `.json`/`.txt`/`.m3u`）；Web 版还会带上你导入的
   自定义源。
2. **展开多仓**：命中 `storeHouse` / `urls` 字段的聚合仓，取出其中的子线路继续探测。Web 版在这
   一步会对整个候选池去重（CLI 版不去重）。
3. **健康度打分**（Web 版，0~100）：不只看 HTTP 200，也不只看结构合法，还要看**里面到底有没有内容**。

| 分数 | 档位 | 判据 | 颜色 |
| --- | --- | --- | --- |
| **0** | 不可用 | 连不通 / HTTP≠200 / 空响应 / HTML 挑战页 / 二进制文件 | 灰 |
| **40** | 非配置 | 能访问，但认不出是配置（`{}`、`{"error":...}`、看不出条目的纯文本） | 红 |
| **60** | 空配置 | 结构合法却一条内容都没有（`{"sites": []}`） | 橙 |
| **80~89** | 可用 | 有真实内容 | 黄绿 |
| **90~100** | 可用 | 内容多、响应快、字段完整 | 绿 |

80 分以上才算「可用」。80 分之上的 20 分来自：内容条数 0~12 分（对数递减：1 条 2 分、
10 条 6 分、50 条 10 分、100+ 12 分）、响应速度 0~5 分、配置完整度 0~3 分（有 `spider`、
`parses`、`lives` 各 +1）。

条目数的算法：影视配置数 `sites + spiders + lives`，多仓数 `storeHouse/urls`，文本列表数
`#EXTINF` 行或「名称,http://...」行。

GitHub README / 仓库文件树这类**索引源**本身不是配置，不参与可用判定，但只要连得通就会展开。

> CLI 版仍是二元判定（可用 / 不可用），没有健康度。

## 自定义数据源

- Web 版：页面上的「自定义源」面板导入即可；要改内置清单见
  `server/modules/sources/builtin-sources.ts`
- CLI 版：`cli/ysc_link_checker.py` 的 `SEED_LINKS` / `GITHUB_MD_SOURCES` / `GITHUB_REPO_SOURCES`

## 免责声明

- 本工具仅用于学习与交流，请勿用于商业用途；
- 「可用」指健康度 ≥ 80，即链接可访问、内容是有效配置 / 列表**且里面确实有条目**；
  健康度只反映配置本身，不保证里面每个片源都能播；公益接口随时可能失效，以当次检测为准；
- 接口版权归原作者所有。
