# 手机访问与数据落盘设计（把电脑变成网站服务器）

## 目标

1. 手机在 4G / 校园网 / 外网下都能打开这个网站，且**只有我自己的设备**能访问。
2. 文章库、单词本、精读笔记等复习数据**存在电脑上**，手机与电脑看到同一份数据。
3. 手机上可以「添加到主屏幕」，开起来像 App。

## 现状与问题

- **组网**：`server/index.js` 直接 `createApp(...).listen(port)`，默认监听所有网卡；本机 WLAN 是 `10.122.196.235/18`，DHCP 服务器 `10.3.9.3`，默认网关只有 IPv6 link-local —— 典型校园大内网。这类网络通常开启终端隔离（手机与电脑同 Wi-Fi 也互访不通），且 IP 会变。结论：局域网直连不可靠，**也不应该在这张网上开端口**。
- **数据**：`public/js/article-library.js` 用 IndexedDB（库名 `cet6-reading-library`）存文章与文件夹；`public/js/app.js` 用 localStorage 存单词本（`cet6:wordbook`）、高亮（`cet6:highlights`）、当前文章、预热缓存、主题。两者都是「按浏览器」的，所以手机打开会是空库。
- **有利条件**：前端请求已经是相对路径 `/api/translate`（`public/js/api.js`），没有写死 `localhost`；Express 默认监听所有网卡。也就是说「让手机能打开网站」这一半几乎零改动。
- **安全现状**：DeepSeek Key 只存在于电脑的 `.env`，由 `server/deepseek.js` 读取；手机不会拿到 Key。`.env` 已在 `.gitignore` 中。

## 方案

### A. 组网：Tailscale + `tailscale serve`（私有 tailnet）

- 电脑安装 Tailscale 并登录，手机安装 Tailscale App 登同一账号 → 两台设备进入同一个 tailnet（免费个人版够用）。**别的设备即使知道域名也访问不到**，因为它不在 tailnet 里。
- Node 只监听回环：`.env` 新增 `HOST`（默认 `127.0.0.1`），`server/index.js` 改为 `listen(port, host)`。
- `tailscale serve --bg --https=443 http://127.0.0.1:3000` 把 3000 端口反代到 tailnet 上的 HTTPS 地址，手机访问 `https://<电脑名>.<tailnet 名>.ts.net`，证书由 Tailscale 自动签发（需在管理后台开启 HTTPS 证书功能）。
- 好处：校园网上**零开放端口**、不用改防火墙、不需要公网 IP、自带 HTTPS。
- 回退：把 `HOST` 设为 `0.0.0.0` 即可恢复局域网直连（文档里写明需要防火墙规则且只在受信网络里用）。

### B. 数据落盘：JSON 文件存储 + REST API

新增 `server/store.js`：

- 单文件 `data/library.json`，结构 `{ version: 1, articles: [], folders: [], wordbook: [] }`；目录由 `DATA_DIR` 配置，默认 `./data`。
- 读取：首次访问时懒加载。文件不存在 → 空文档；JSON 解析失败 → **抛错并让进程启动失败**（宁可服务不起，也绝不用空数据覆盖用户数据），错误信息包含文件路径与修复建议。
- 写入：整体文档写入 `<file>.tmp` 后 `fs.rename` 原子替换；所有写操作串行化（一条 Promise 链），避免并发写交错截断文件。
- 存储层导出纯函数 + 单例包装，便于单测：`listArticles` / `getArticle` / `putArticle` / `deleteArticle` / `listFolders` / `putFolder` / `deleteFolder` / `getWordbook` / `putWordbook` / `importAll`。
- `deleteFolder(id)` 保留既有语义：把该文件夹下文章的 `folderId` 置空（与 `app.js:354-356` 现在的做法一致）。前端那段「先解绑再删除」的代码**保持不动**，服务端同样做兜底。

新增路由（`server/app.js`），沿用现有中文错误文案风格与 `express.json({ limit: '2mb' })`：

| 路由 | 语义 |
| --- | --- |
| `GET /api/library` | `{ articles, folders }` |
| `PUT /api/library/articles/:id` | upsert；校验 `article` 为非空字符串且 ≤ 100000 字符、`id` 与 `body.id` 一致，否则 400；返回 `{ article }` |
| `DELETE /api/library/articles/:id` | 幂等，永远 `{ ok: true }` |
| `PUT /api/library/folders/:id` | upsert；校验 `name` 非空 |
| `DELETE /api/library/folders/:id` | 删除并解绑其文章，返回 `{ ok: true, detached: N }` |
| `GET /api/wordbook` | `{ entries }` |
| `PUT /api/wordbook` | 整体替换；校验是数组、每项 `word` 非空 |
| `POST /api/library/import` | 一次性迁移：`{ articles, folders, wordbook }`。文章与文件夹按 `id` upsert，文章冲突时取 `updatedAt` 较新的一方；单词本**只补服务器还没有的词**（同词条目保留服务器版本，避免用本机旧档案覆盖）；返回 `{ imported: { articles, folders, wordbook } }` |

### C. 前端改造（尽量不动 `app.js` 的业务逻辑）

- 新增 `public/js/library-api.js`：把上表端点包成函数（`fetchLibrary`、`putArticle`、`deleteArticle`、`putFolder`、`deleteFolder`、`fetchWordbook`、`putWordbook`、`importLocalData`），失败时抛出带中文文案的 Error。
- 改写 `public/js/article-library.js`：**导出函数名与返回契约保持不变**（`listArticles` / `getArticle` / `saveArticle` / `deleteArticle` / `listFolders` / `createFolder` / `deleteFolder`，其中 `createFolder` 仍解析出新文件夹的 **id**，见 `app.js:1295-1297`），内部改为调用 API。于是 `app.js` 里那 10 处调用点都不用改。
- **排序契约也保持不变**：`listArticles` 按 `updatedAt` 降序、`listFolders` 按 `createdAt` 升序，由适配层排序，服务端不保证返回顺序。`getArticle(id)` 在 id 不存在时解析为 `undefined`（不是抛错），与 IndexedDB `get` 的现状一致。
- 单词本：`app.js` 中 4 处 `localStorage.setItem(storageKeys.wordbook, ...)` 收敛为一个 `persistWordbook(entries)`（写服务器，失败时在状态区提示）；启动时 `await fetchWordbook()` 覆盖 `state.entries`。localStorage 只保留主题、当前文章文本、预热缓存这些「本机便利数据」。
- 迁移：库页面新增「本机数据同步」区块（`#library-sync`）。服务器库为空时高亮「把本机数据上传到服务器」按钮；点击后读取本机 IndexedDB 与 localStorage，调 `POST /api/library/import`，成功提示「已上传 N 篇、M 个词」。**不清空浏览器数据**（它天然是一份备份）。服务器非空时按钮仍可点（走同一套合并语义），只是不高亮。
- 断连：新增顶部提示条 `#server-status`（`role="status"`），任何 API 请求失败时显示「未连接到电脑服务器（数据未同步）」，请求恢复后自动隐藏。
- `.gitignore` 增加 `data/`（数据不进 git）。

### D. PWA（手机添加到主屏幕）

- 新增 `public/manifest.webmanifest`：`name` 六级精读工作台、`short_name` 精读、`display` standalone、`start_url` `/`、`theme_color` / `background_color` 与现有主题一致、`icons` 192 与 512。
- 图标文件 `public/icons/icon-192.png`、`icon-512.png`、`apple-touch-icon.png`(180) 用 PowerShell `System.Drawing` 生成，**不引入新依赖**。
- `public/index.html` 补 `<link rel="manifest">`、`<meta name="theme-color">`、`<link rel="apple-touch-icon">`（`viewport` 已有）。
- **不做** Service Worker 离线缓存：离线时数据本来就取不到，缓存反而制造「看着有、存不进去」的假象。

### E. 配置与运维文档

- `.env` 增加 `HOST=127.0.0.1` 与 `DATA_DIR=./data`，`.env.example` 同步。
- `server/index.js` 启动日志打印监听地址与「手机访问需先运行 tailscale serve」的提示。
- README 新增「手机访问（Tailscale）」章节：电脑端安装/登录、`tailscale serve` 命令、后台开 HTTPS、手机安装登录、添加到主屏幕、电源计划设为「从不睡眠」、常见故障排查（证书未开 / tailnet 未连 / 防火墙 / Key 失效）。
- 安全取舍：**不加应用层密码**，因为 tailnet 已经把访问限定在我的设备上；如果以后要把网址分享给别人，再单独加令牌。
- 提醒：`.env` 不进 git；若 Key 曾被贴到聊天或截图里，去 DeepSeek 后台重置。

## 测试

- `test/store.test.js`（新）：空目录初始化、读写往返、原子写后临时文件被清理、损坏 JSON 抛错且**不覆盖原文件**、`deleteFolder` 解绑文章、`putWordbook` 整体替换、10 个并发写后文件仍是合法 JSON 且包含全部结果。
- `test/library-api.test.js`（新，supertest）：空库 `GET /api/library`；文章 upsert / 删除 / 非法 body（空 `article`、超长、id 不一致）；文件夹增删与 `detached` 计数；单词本校验；`import` 合并语义（按 id upsert、`updatedAt` 新者胜）。
- 既有 13 个测试文件保持全绿（`npm test`）。
- `test/e2e.py` 增加场景：清空浏览器 storage 后重新加载，仍能看到服务器里的文章与单词本。

## 范围与约束

- 不做多用户、账号体系与应用层密码。
- 不做离线缓存与冲突合并 UI；同一时刻以最后一次写入为准。
- 不做「续读位置跨设备同步」（当前文章文本仍存本机 localStorage）。
- 不迁移预热缓存（`cet6:prestudy-cache`）：从库里打开文章时，译文与生词表本来就在文章记录里，够用。
- 两端同时编辑同一篇文章的极端情况不加锁，最后写入者胜。

## 需要人工完成（不是代码）

1. 安装并登录 Tailscale（需要管理员权限；当前会话不是管理员，我无法代劳）：`winget install --id Tailscale.Tailscale`，没有 winget 就用官网安装包。
2. 在 Tailscale 管理后台开启 HTTPS 证书功能。
3. 执行 `tailscale serve --bg --https=443 http://127.0.0.1:3000`。
4. 手机装 Tailscale App、登同一账号并连接。
5. 电源计划把「睡眠」设为「从不」（至少在插电时）。
