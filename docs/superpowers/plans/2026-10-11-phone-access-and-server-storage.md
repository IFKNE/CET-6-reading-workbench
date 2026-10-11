# 手机访问与数据落盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让这个网站以本机电脑为服务器、通过 Tailscale 私有网络供手机访问，并把文章库与单词本从浏览器存储搬到电脑上的 `data/library.json`。

**Architecture:** 服务端新增一个懒加载 + 原子写的 JSON 文档存储（`server/store.js`），通过 8 个 REST 路由暴露给前端；前端新增 `public/js/library-api.js` 作为唯一的 HTTP 客户端，把旧的 IndexedDB 实现整体挪到 `public/js/legacy-library.js` 仅用于一次性迁移，`public/js/article-library.js` 保持原有导出契约但改为调用 API —— 因此 `public/js/app.js` 的 10 处调用点无需改动。网络侧不改代码逻辑，只把监听地址收敛为回环地址（`HOST`），由 `tailscale serve` 负责 tailnet 内的 HTTPS 入口。

**Tech Stack:** Node.js 24（原生 `node:test`、`structuredClone`、顶层 await）、Express 5、supertest 7、原生 ES modules（浏览器端无打包器）、Tailscale（`tailscale serve`）、PowerShell + System.Drawing（生成 PWA 图标）。

**设计依据:** `docs/superpowers/specs/2026-10-11-phone-access-and-server-storage-design.md`

**环境事实（已核实）:**
- `node -v` → `v24.14.1`；`npm test` → `node --test`（自动发现 `test/**/*.test.js`）。
- 本机**不是**管理员，装 Tailscale 那一步必须由用户手工完成。
- 本机 Python 3.13.9 存在但**没有安装 playwright**（`ModuleNotFoundError: No module named 'playwright'`），因此 `test/e2e.py` 当前跑不起来，本计划的验收以 Task 13 的 REST 实测为准，不依赖 playwright。
- 仓库根目录**没有** `.env.example`（README 里提到它，属于历史遗留），Task 6 会补上。
- **测试命令约定：** 计划里写的 `node --test <file>` 在你自己的电脑上直接可用；在受限沙箱里跑要给测试运行器加 `--test-isolation=none`（`npm test` 会为每个测试文件开管道子进程，被沙箱拒绝为 `spawn EPERM`，**既有 13 个测试文件同样失败**，不是代码问题）。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `server/store.js`（新建） | 唯一的数据层：懒加载 `data/library.json`、串行化原子写、文章/文件夹/单词本的读写与迁移合并。不碰 HTTP。 |
| `server/app.js`（修改） | 在现有 `/api/translate`、`/api/wordbook.docx` 之外新增 `/api/library*` 与 `/api/wordbook` 路由，只做参数校验与状态码映射。 |
| `server/index.js`（修改） | 从环境变量读 `PORT`/`HOST`，监听回环地址并打印手机访问提示。 |
| `public/js/library-api.js`（新建） | 唯一的 HTTP 客户端：8 个端点包装 + 服务器在线状态订阅。 |
| `public/js/article-library.js`（改写） | 文章库适配层，导出契约不变（含排序与 `createFolder` 返回 id），内部改调 API。 |
| `public/js/legacy-library.js`（新建） | 旧 IndexedDB 实现的留存副本（含旧 localStorage 单词本读取），仅供一次性迁移使用。 |
| `public/js/app.js`（修改） | 单词本改为服务端持久化（`persistWordbook`）、启动时拉取、迁移按钮与断连提示条接线。 |
| `public/index.html`（修改） | 新增 `#server-status` 提示条、`#library-sync` 迁移区块、PWA 三个 `<link>`/`<meta>`。 |
| `public/styles.css`（修改） | `#server-status` 与 `.library-sync` 的样式。 |
| `public/manifest.webmanifest`（新建） | PWA 清单。 |
| `public/icons/*.png`（新建） | 192/512/apple-touch 三个图标。 |
| `test/store.test.js`（新建） | 存储层单测。 |
| `test/library-api.test.js`（新建） | 路由层单测（supertest）。 |
| `test/library-api-client.test.js`（新建） | 前端 HTTP 客户端单测（stub `globalThis.fetch`）。 |
| `test/article-library-adapter.test.js`（新建） | 适配层契约单测（排序、`getArticle` 未命中、`createFolder` 返回 id）。 |
| `README.md`、`.env.example`、`.gitignore`（修改） | 手机访问章节、环境变量样例、忽略 `data/`。 |

---

## Task 1: 存储层骨架（懒加载 + 读写往返）

**Files:**
- Create: `server/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: 写失败的测试**

创建 `test/store.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';

async function createTemporaryStore(options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-'));
  return { dataDir, store: createStore({ dataDir, ...options }) };
}

test('空目录时文章、文件夹、单词本都是空数组', async () => {
  const { store } = await createTemporaryStore();
  assert.deepEqual(await store.listArticles(), []);
  assert.deepEqual(await store.listFolders(), []);
  assert.deepEqual(await store.getWordbook(), []);
  assert.equal(await store.getArticle('missing'), undefined);
});

test('写入文章后可以按 id 读回，且内容与写入一致', async () => {
  const { store } = await createTemporaryStore();
  const article = { id: 'a1', title: '精读一', article: 'Hello world.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z', vocabulary: { hello: { word: 'hello' } } };
  await store.putArticle(article);
  assert.deepEqual(await store.getArticle('a1'), article);
  assert.deepEqual(await store.listArticles(), [article]);

  const updated = { ...article, title: '精读一（改）', updatedAt: '2026-10-11T01:00:00.000Z' };
  await store.putArticle(updated);
  assert.deepEqual(await store.listArticles(), [updated]);

  await store.deleteArticle('a1');
  assert.deepEqual(await store.listArticles(), []);
});

test('写入会落盘：换一个新实例仍能读回同一份数据', async () => {
  // 只有这条能证明数据真的在磁盘上——同实例读回可能只是读了内存缓存。
  const { dataDir, store } = await createTemporaryStore();
  const article = { id: 'a1', article: 'Hello world.', updatedAt: '2026-10-11T00:00:00.000Z' };
  await store.putArticle(article);
  const reopened = createStore({ dataDir });
  assert.deepEqual(await reopened.listArticles(), [article]);
});

test('只读不写时不会创建文件', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.listArticles();
  await assert.rejects(() => fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), { code: 'ENOENT' });
});

test('返回的数组与对象都是副本，改它不会影响存储', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const list = await store.listArticles();
  list.push({ id: 'ghost' });
  list[0].article = '被改了';
  assert.deepEqual((await store.listArticles()).map((item) => item.id), ['a1']);
  assert.equal((await store.getArticle('a1')).article, 'One.');
});

test('落盘失败时内存不领先磁盘，后续写入不会把失败的改动带上盘', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a2', article: 'Two.', updatedAt: '2026-10-11T00:00:00.000Z' });

  // 把临时文件路径先占成一个目录：writeFile 必然失败，等价于“磁盘写不进去”。
  const blocked = path.join(dataDir, 'library.json.tmp');
  await fs.mkdir(blocked);
  await assert.rejects(() => store.deleteArticle('a1'));
  await fs.rm(blocked, { recursive: true, force: true });

  // 失败的删除没有生效……
  assert.deepEqual((await store.listArticles()).map((item) => item.id), ['a1', 'a2']);
  // ……而且后续成功写入也不会顺手把它落盘。
  await store.putArticle({ id: 'a3', article: 'Three.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.deepEqual(onDisk.articles.map((item) => item.id).sort(), ['a1', 'a2', 'a3']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/store.test.js`
Expected: FAIL — `Cannot find module '.../server/store.js'`

- [ ] **Step 3: 写最小实现**

创建 `server/store.js`：

```js
import fs from 'node:fs/promises';
import path from 'node:path';

// 单一 JSON 文档：单人单机数据量很小，换来的是可直接阅读、可直接备份的文件。
function emptyDocument() {
  return { version: 1, articles: [], folders: [], wordbook: [] };
}

// 形状不对时与 JSON 语法错误同等处理：宁可服务报错，也不让一份半截文件变成空库。
function corrupt(filePath, detail, cause) {
  const suffix = detail ? `（${detail}）` : '';
  return new Error(`文章库文件无法解析：${filePath}${suffix}。请先备份该文件，再修复或删除它后重启服务。`, { cause });
}

function normalizeDocument(parsed, filePath) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupt(filePath, '根节点必须是对象');
  }
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw corrupt(filePath, `不支持的文档版本 ${String(parsed.version)}`);
  }
  for (const field of ['articles', 'folders', 'wordbook']) {
    if (parsed[field] !== undefined && !Array.isArray(parsed[field])) {
      throw corrupt(filePath, `${field} 必须是数组`);
    }
  }
  return { ...emptyDocument(), articles: parsed.articles ?? [], folders: parsed.folders ?? [], wordbook: parsed.wordbook ?? [] };
}

export function createStore({ dataDir = process.env.DATA_DIR || './data', now = () => new Date().toISOString() } = {}) {
  const filePath = path.join(dataDir, 'library.json');
  let document = null;
  let writeChain = Promise.resolve();

  async function load() {
    if (document) return document;
    try {
      document = normalizeDocument(JSON.parse(await fs.readFile(filePath, 'utf8')), filePath);
    } catch (error) {
      if (error.code === 'ENOENT') document = emptyDocument();
      else if (error instanceof SyntaxError) throw corrupt(filePath, error.message, error);
      else throw error;
    }
    return document;
  }

  async function persist(target) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, filePath);
  }

  // 写操作串行化，并且「先写副本、落盘成功后才推进内存」：
  // 若先改内存再落盘，一旦落盘失败，内存就领先于磁盘——调用方收到的是失败，
  // 而后续任何一次成功写入都会把这次被判定失败的改动悄悄带上盘。
  function mutate(action) {
    const next = writeChain.catch(() => {}).then(async () => {
      const draft = structuredClone(await load());
      const result = action(draft);
      await persist(draft);
      document = draft;
      return result;
    });
    writeChain = next;
    return next;
  }

  async function snapshot() {
    return structuredClone(await load());
  }

  return {
    filePath,
    async listArticles() {
      return (await snapshot()).articles;
    },
    async listFolders() {
      return (await snapshot()).folders;
    },
    async getArticle(id) {
      return (await snapshot()).articles.find((article) => article.id === id);
    },
    async getWordbook() {
      return (await snapshot()).wordbook;
    },
    putArticle(article) {
      return mutate((current) => {
        const record = structuredClone(article);
        const index = current.articles.findIndex((item) => item.id === article.id);
        if (index === -1) current.articles.push(record);
        else current.articles[index] = record;
        return record;
      });
    },
    deleteArticle(id) {
      return mutate((current) => {
        const before = current.articles.length;
        current.articles = current.articles.filter((article) => article.id !== id);
        return { removed: before - current.articles.length };
      });
    }
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/store.test.js`（沙箱里用 `node --test --test-isolation=none test/store.test.js`，见文首约定）
Expected: PASS（6 个 test 全绿）

> **修订记录（Task 1 代码质量复核后）：** 初版 `mutate` 是「先改内存、再落盘」，复核用一个必然失败的 `persist`（把 `library.json.tmp` 占成目录）复现出内存领先磁盘、后续写入把已报失败的改动带上盘。现在改成副本写盘（`draft` → `persist(draft)` → `document = draft`），并补了形状/版本校验与 4 个回归测试（磁盘往返、只读不建文件、副本隔离、落盘失败不脱节）。

- [ ] **Step 5: 提交**

```bash
git add server/store.js test/store.test.js
git commit -m "feat(store): 新增 JSON 文档存储的懒加载与文章读写"
```

---

## Task 2: 存储层边界（原子写、损坏文件、删文件夹解绑、并发写、单词本整体替换）

**Files:**
- Modify: `server/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: 追加失败的测试**

把下面内容追加到 `test/store.test.js` 末尾（保留 Task 1 已有内容）：

```js
test('写入是原子的：落盘后不残留临时文件，且文件是合法 JSON', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'Atomic write.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const files = await fs.readdir(dataDir);
  assert.deepEqual(files, ['library.json']);
  const parsed = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.equal(parsed.articles.length, 1);
  assert.equal(parsed.version, 1);
});

test('文件损坏时抛错，且不改写原文件', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-broken-'));
  const broken = '{ 这不是 JSON';
  await fs.writeFile(path.join(dataDir, 'library.json'), broken, 'utf8');
  const store = createStore({ dataDir });
  await assert.rejects(() => store.listArticles(), { message: /无法解析/ });
  await assert.rejects(() => store.putArticle({ id: 'a1', article: 'x' }), { message: /无法解析/ });
  assert.equal(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), broken);
});

test('文档形状或版本不合法时同样报错，且不改写文件', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-shape-'));
  const original = JSON.stringify({ version: 1, articles: 'oops', folders: [], wordbook: [] });
  await fs.writeFile(path.join(dataDir, 'library.json'), original, 'utf8');
  await assert.rejects(() => createStore({ dataDir }).listArticles(), { message: /无法解析/ });

  const versioned = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-version-'));
  await fs.writeFile(path.join(versioned, 'library.json'), JSON.stringify({ version: 2, articles: [], folders: [], wordbook: [] }), 'utf8');
  await assert.rejects(() => createStore({ dataDir: versioned }).listArticles(), { message: /不支持的文档版本/ });
  assert.equal(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), original);
});

test('putArticle 的返回值也是副本，改它不会写进存储', async () => {
  // 返回值若引用内部状态，调用方改一下就只改了内存、没改磁盘，
  // 下一次成功写入会把它带上盘——和 Task 1 修掉的“内存领先磁盘”是同一类问题。
  const { store } = await createTemporaryStore();
  const saved = await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  saved.article = '被调用方改了';
  assert.equal((await store.getArticle('a1')).article, 'One.');
});

test('删除文件夹会把其中文章解绑为未归档并计数', async () => {
  // 注入固定时钟：断言解绑时确实盖了当前时间，而不是靠“不等于旧值”这种弱断言。
  const stamp = '2026-10-11T02:00:00.000Z';
  const { store } = await createTemporaryStore({ now: () => stamp });
  await store.putFolder({ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a1', article: 'One.', folderId: 'f1', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a2', article: 'Two.', folderId: 'f1', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a3', article: 'Three.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z' });

  assert.deepEqual(await store.listFolders(), [{ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' }]);
  const result = await store.deleteFolder('f1');
  assert.equal(result.detached, 2);
  assert.deepEqual(await store.listFolders(), []);
  const articles = await store.listArticles();
  assert.deepEqual(articles.map((article) => article.folderId), ['', '', '']);
  // 解绑会刷新 updatedAt，否则手机/电脑合并时这条改动可能被判为“不更新”。
  assert.deepEqual(articles.filter((article) => article.id !== 'a3').map((article) => article.updatedAt), [stamp, stamp]);
  assert.equal(articles.find((article) => article.id === 'a3').updatedAt, '2026-10-11T00:00:00.000Z');
});

test('单词本是整体替换', async () => {
  const { store } = await createTemporaryStore();
  await store.putWordbook([{ word: 'hello', meaning: '你好' }, { word: 'world', meaning: '世界' }]);
  assert.deepEqual((await store.getWordbook()).map((entry) => entry.word), ['hello', 'world']);
  await store.putWordbook([{ word: 'hello', meaning: '你好（改）' }]);
  assert.deepEqual(await store.getWordbook(), [{ word: 'hello', meaning: '你好（改）' }]);
});

test('并发写入被串行化，结果全部保留且文件仍可解析', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await Promise.all(Array.from({ length: 10 }, (_, index) => store.putArticle({
    id: `a${index}`, article: `Article ${index}.`, updatedAt: '2026-10-11T00:00:00.000Z'
  })));
  const articles = await store.listArticles();
  assert.equal(articles.length, 10);
  const parsed = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.equal(parsed.articles.length, 10);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.putFolder is not a function`（以及单词本相关失败）。
注意：「文档形状或版本不合法」这条属于 Task 1 已实现的行为，此时**应当直接通过**，它的失败反而是问题信号。

- [ ] **Step 3: 补齐实现**

先修一个复核发现的返回引用问题：把 `putArticle` 的 `return record;` 改成 `return structuredClone(record);`（Task 1 复核 Important #2：当前返回值是内部对象的引用，调用方改它会只改内存不改磁盘，属于「内存领先磁盘」的同一类问题）。

然后把 `server/store.js` 中 `return { ... }` 里 `deleteArticle` 之后补上文件夹与单词本方法（`mutate`/`persist`/`load` 已在 Task 1 写好，无需改动）：

```js
    putFolder(folder) {
      return mutate((current) => {
        const record = structuredClone(folder);
        const index = current.folders.findIndex((item) => item.id === folder.id);
        if (index === -1) current.folders.push(record);
        else current.folders[index] = record;
        return structuredClone(record);
      });
    },
    deleteFolder(id) {
      return mutate((current) => {
        current.folders = current.folders.filter((folder) => folder.id !== id);
        let detached = 0;
        current.articles = current.articles.map((article) => {
          if (article.folderId !== id) return article;
          detached += 1;
          return { ...article, folderId: '', updatedAt: now() };
        });
        return { detached };
      });
    },
    putWordbook(entries) {
      return mutate((current) => {
        current.wordbook = structuredClone(entries);
        return current.wordbook.length;
      });
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-isolation=none test/store.test.js`
Expected: PASS（13 个 test 全绿）

- [ ] **Step 5: 提交**

```bash
git add server/store.js test/store.test.js
git commit -m "feat(store): 文件夹与单词本读写，覆盖原子写与损坏文件边界"
```

---

## Task 3: 迁移合并语义 `importAll`

**Files:**
- Modify: `server/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: 追加失败的测试**

追加到 `test/store.test.js` 末尾：

```js
test('迁移时文章取 updatedAt 较新的一方，文件夹按 id 覆盖', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'Server copy.', updatedAt: '2026-10-11T10:00:00.000Z' });
  await store.putFolder({ id: 'f1', name: '服务器文件夹', createdAt: '2026-10-11T00:00:00.000Z' });

  const result = await store.importAll({
    articles: [
      { id: 'a1', article: 'Local stale copy.', updatedAt: '2026-10-11T09:00:00.000Z' },
      { id: 'a2', article: 'Local fresh copy.', updatedAt: '2026-10-11T11:00:00.000Z' }
    ],
    folders: [
      { id: 'f1', name: '本机文件夹', createdAt: '2026-10-11T00:00:00.000Z' },
      { id: 'f2', name: '新文件夹', createdAt: '2026-10-11T00:00:00.000Z' }
    ],
    wordbook: [{ word: 'hello', meaning: '本机旧释义' }, { word: 'brandnew', meaning: '新词' }]
  });

  assert.equal(result.articles, 1);
  assert.equal(result.folders, 2);
  assert.equal(result.wordbook, 1);
  const articles = await store.listArticles();
  assert.equal(articles.find((article) => article.id === 'a1').article, 'Server copy.');
  assert.equal(articles.find((article) => article.id === 'a2').article, 'Local fresh copy.');
  assert.deepEqual((await store.listFolders()).map((folder) => folder.name).sort(), ['本机文件夹', '新文件夹']);
  assert.deepEqual((await store.getWordbook()).map((entry) => entry.word), ['brandnew']);
});

test('迁移时单词本保留服务器已有条目，只补新词', async () => {
  const { store } = await createTemporaryStore();
  await store.putWordbook([{ word: 'hello', meaning: '服务器释义', learningStatus: 'known' }]);
  const result = await store.importAll({ wordbook: [{ word: 'HELLO', meaning: '本机释义' }, { word: '', meaning: '坏数据' }] });
  assert.equal(result.wordbook, 0);
  assert.deepEqual(await store.getWordbook(), [{ word: 'hello', meaning: '服务器释义', learningStatus: 'known' }]);
});

test('putWordbook 拒绝非数组，不会写出自己读不回来的文档', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await assert.rejects(() => store.putWordbook('hello'), { message: /entries 必须是数组/ });
  // 关键：拒绝之后文件仍然可读——否则整库会因为一次坏调用变成打不开的状态。
  assert.deepEqual(await createStore({ dataDir }).getWordbook(), []);
});

test('deleteFolder 收到空 id 时不动「未归档」的文章', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z' });
  assert.deepEqual(await store.deleteFolder(''), { detached: 0 });
  assert.equal((await store.getArticle('a1')).updatedAt, '2026-10-11T00:00:00.000Z');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.importAll is not a function`

- [ ] **Step 3: 先补两处存储层自身的防护（Task 2 复核结论）**

这两处都是「不写自己读不回来的数据」，与 Task 3 的改动同文件，一起做：

1. `putWordbook` 开头加类型守卫。Task 2 复核实测：`putWordbook('hello')` 会把 `"wordbook": "hello"` 落盘，之后**每次 `getWordbook()` 都会报「wordbook 必须是数组」**，文件在手工修复前一直是坏的。这不是条目级校验（那属于 Task 5 的路由），而是守住 `normalizeDocument` 自己的读回不变量：

```js
    putWordbook(entries) {
      if (!Array.isArray(entries)) throw new TypeError('entries 必须是数组。');
      return mutate((current) => {
        current.wordbook = structuredClone(entries);
        return current.wordbook.length;
      });
    }
```

2. `deleteFolder` 加空 id 守卫，并把时间戳提到 `map` 之外（一次解绑只盖一个时间戳）：

```js
    deleteFolder(id) {
      // 空 id 会让「未归档」（folderId === ''）的文章全部被误判成成员。
      if (!id) return Promise.resolve({ detached: 0 });
      return mutate((current) => {
        current.folders = current.folders.filter((folder) => folder.id !== id);
        const stamp = now();
        let detached = 0;
        current.articles = current.articles.map((article) => {
          if (article.folderId !== id) return article;
          detached += 1;
          return { ...article, folderId: '', updatedAt: stamp };
        });
        return { detached };
      });
    },
```

- [ ] **Step 4: 实现 `importAll`**

在 `server/store.js` 的 `putWordbook` 之后追加：

```js
    importAll({ articles = [], folders = [], wordbook = [] } = {}) {
      return mutate((current) => {
        let importedArticles = 0;
        let importedWordbook = 0;

        for (const folder of folders) {
          const record = structuredClone(folder);
          const index = current.folders.findIndex((item) => item.id === folder.id);
          if (index === -1) current.folders.push(record);
          else current.folders[index] = record;
        }

        for (const article of articles) {
          const record = structuredClone(article);
          const index = current.articles.findIndex((item) => item.id === article.id);
          if (index === -1) {
            current.articles.push(record);
            importedArticles += 1;
            continue;
          }
          // 冲突时以 updatedAt 较新者为准，避免本机旧数据覆盖服务器上的新编辑。
          const existing = current.articles[index];
          if (String(article.updatedAt ?? '').localeCompare(String(existing.updatedAt ?? '')) > 0) {
            current.articles[index] = record;
            importedArticles += 1;
          }
        }

        const known = new Set(current.wordbook.map((entry) => String(entry?.word ?? '').toLowerCase()));
        for (const entry of wordbook) {
          const key = String(entry?.word ?? '').toLowerCase();
          // 同词条目保留服务器版本：它可能带着学习状态、标签与已生成档案，比本机旧释义更值钱。
          if (!key || known.has(key)) continue;
          known.add(key);
          current.wordbook.push(structuredClone(entry));
          importedWordbook += 1;
        }

        return { articles: importedArticles, folders: folders.length, wordbook: importedWordbook };
      });
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-isolation=none test/store.test.js`
Expected: PASS（16 个 test 全绿）

- [ ] **Step 6: 提交**

```bash
git add server/store.js test/store.test.js
git commit -m "feat(store): 迁移合并语义与 putWordbook/deleteFolder 防护"
```

---

## Task 4: 文章库 REST 路由

**Files:**
- Modify: `server/app.js`
- Test: `test/library-api.test.js`

- [ ] **Step 1: 写失败的测试**

创建 `test/library-api.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';

const translator = { translate: async () => { throw new Error('不应调用翻译服务'); } };

async function createTestApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-api-'));
  return createApp({ translator, store: createStore({ dataDir }) });
}

const article = (id, overrides = {}) => ({
  id, article: `Body of ${id}.`, title: `标题 ${id}`, category: '短篇阅读', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z', ...overrides
});

test('空库时 GET /api/library 返回空数组', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/library');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { articles: [], folders: [] });
});

test('PUT 文章后能在 GET 里读到，DELETE 之后消失', async () => {
  const app = await createTestApp();
  const put = await request(app).put('/api/library/articles/a1').send(article('a1'));
  assert.equal(put.status, 200);
  assert.equal(put.body.article.id, 'a1');
  assert.equal((await request(app).get('/api/library')).body.articles.length, 1);

  const remove = await request(app).delete('/api/library/articles/a1');
  assert.equal(remove.status, 200);
  assert.deepEqual(remove.body, { ok: true, removed: 1 });
  assert.deepEqual((await request(app).get('/api/library')).body.articles, []);
  // 幂等：重复删除仍是 200。
  assert.equal((await request(app).delete('/api/library/articles/a1')).status, 200);
});

test('PUT 文章校验 id 一致、正文非空且不超长', async () => {
  const app = await createTestApp();
  const mismatch = await request(app).put('/api/library/articles/a1').send(article('a2'));
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error, /id/);

  const empty = await request(app).put('/api/library/articles/a1').send(article('a1', { article: '   ' }));
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /article/);

  const tooLong = await request(app).put('/api/library/articles/a1').send(article('a1', { article: 'x'.repeat(100001) }));
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.body.error, /100000/);
});

test('文件夹可增删，删除时返回解绑篇数', async () => {
  const app = await createTestApp();
  assert.equal((await request(app).put('/api/library/folders/f1').send({ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' })).status, 200);
  const bad = await request(app).put('/api/library/folders/f2').send({ id: 'f2', name: '   ' });
  assert.equal(bad.status, 400);

  await request(app).put('/api/library/articles/a1').send(article('a1', { folderId: 'f1' }));
  const remove = await request(app).delete('/api/library/folders/f1');
  assert.equal(remove.status, 200);
  assert.deepEqual(remove.body, { ok: true, detached: 1 });
  assert.equal((await request(app).get('/api/library')).body.articles[0].folderId, '');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/library-api.test.js`
Expected: FAIL — `GET /api/library` 返回 404（拿到的是 `express.static` 的兜底响应）

- [ ] **Step 3: 实现路由**

修改 `server/app.js`：把文件顶部改成下面这样（新增 `store` 导入与 `createApp` 的默认参数），并在 `/api/wordbook.docx` 路由**之后**、`app.use(express.static(...))` **之前**插入 4 个文章库路由。

```js
import express from 'express';
import path from 'node:path';
import { createWordbookDocument } from './docx-export.js';
import { createStore } from './store.js';

const validScopes = new Set(['word', 'word-batch', 'phrase', 'sentence', 'paragraph', 'question', 'prestudy']);

// id 取自路径：为空直接 400，并让调用方知道响应已经写过。
function readIdParam(req, res) {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    res.status(400).json({ error: 'id 不能为空。' });
    return null;
  }
  return id;
}

export function createApp({ translator, store = createStore() }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
```

```js
  app.get('/api/library', async (req, res) => {
    try {
      const [articles, folders] = await Promise.all([store.listArticles(), store.listFolders()]);
      return res.json({ articles, folders });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章库读取失败。' });
    }
  });

  app.put('/api/library/articles/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    const article = req.body ?? {};
    if (article.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof article.article !== 'string' || article.article.trim().length === 0) {
      return res.status(400).json({ error: 'article 必须是非空文本。' });
    }
    if (article.article.length > 100000) return res.status(400).json({ error: 'article 不能超过 100000 个字符。' });
    try {
      return res.json({ article: await store.putArticle(article) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章保存失败。' });
    }
  });

  app.delete('/api/library/articles/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    try {
      const { removed } = await store.deleteArticle(id);
      return res.json({ ok: true, removed });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章删除失败。' });
    }
  });

  app.put('/api/library/folders/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    const folder = req.body ?? {};
    if (folder.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof folder.name !== 'string' || folder.name.trim().length === 0) {
      return res.status(400).json({ error: 'name 必须是非空文本。' });
    }
    try {
      return res.json({ folder: await store.putFolder(folder) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文件夹保存失败。' });
    }
  });

  app.delete('/api/library/folders/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    try {
      const { detached } = await store.deleteFolder(id);
      return res.json({ ok: true, detached });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文件夹删除失败。' });
    }
  });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/library-api.test.js`
Expected: PASS（4 个 test 全绿）

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 既有 13 个测试文件 + 新增文件全部 PASS（`createApp({ translator })` 不传 store 时用默认 store，但没有请求碰到它，因此不会创建 `data/`）

```bash
git add server/app.js test/library-api.test.js
git commit -m "feat(api): 文章库与文件夹 REST 路由"
```

---

## Task 5: 单词本与迁移 REST 路由

**Files:**
- Modify: `server/app.js`
- Test: `test/library-api.test.js`

- [ ] **Step 1: 追加失败的测试**

追加到 `test/library-api.test.js` 末尾：

```js
test('单词本 GET / PUT 往返，并校验条目', async () => {
  const app = await createTestApp();
  assert.deepEqual((await request(app).get('/api/wordbook')).body, { entries: [] });

  const put = await request(app).put('/api/wordbook').send({ entries: [{ word: 'hello', meaning: '你好' }] });
  assert.equal(put.status, 200);
  assert.equal(put.body.saved, 1);
  assert.deepEqual((await request(app).get('/api/wordbook')).body.entries, [{ word: 'hello', meaning: '你好' }]);

  const notArray = await request(app).put('/api/wordbook').send({ entries: 'hello' });
  assert.equal(notArray.status, 400);
  assert.match(notArray.body.error, /entries/);

  const badEntry = await request(app).put('/api/wordbook').send({ entries: [{ meaning: '没有词形' }] });
  assert.equal(badEntry.status, 400);
  assert.match(badEntry.body.error, /word/);
});

test('迁移接口合并本机数据', async () => {
  const app = await createTestApp();
  const response = await request(app).post('/api/library/import').send({
    articles: [article('a1')],
    folders: [{ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' }],
    wordbook: [{ word: 'hello', meaning: '你好' }]
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.imported, { articles: 1, folders: 1, wordbook: 1 });

  const again = await request(app).post('/api/library/import').send({ articles: [article('a1')], folders: [], wordbook: [{ word: 'hello' }] });
  assert.deepEqual(again.body.imported, { articles: 0, folders: 0, wordbook: 0 });

  const bad = await request(app).post('/api/library/import').send({ articles: 'nope' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /articles/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/library-api.test.js`
Expected: FAIL — 新增的 2 个 test 返回 404

- [ ] **Step 3: 实现路由**

在 `server/app.js` 的 `DELETE /api/library/folders/:id` 之后追加：

```js
  app.get('/api/wordbook', async (req, res) => {
    try {
      return res.json({ entries: await store.getWordbook() });
    } catch (error) {
      return res.status(500).json({ error: error.message || '单词本读取失败。' });
    }
  });

  app.put('/api/wordbook', async (req, res) => {
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries 必须是数组。' });
    const invalid = entries.find((entry) => typeof entry?.word !== 'string' || entry.word.trim().length === 0);
    if (invalid) return res.status(400).json({ error: '每个单词条目的 word 必须是非空文本。' });
    try {
      return res.json({ ok: true, saved: await store.putWordbook(entries) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '单词本保存失败。' });
    }
  });

  app.post('/api/library/import', async (req, res) => {
    const { articles = [], folders = [], wordbook = [] } = req.body ?? {};
    for (const [name, value] of [['articles', articles], ['folders', folders], ['wordbook', wordbook]]) {
      if (!Array.isArray(value)) return res.status(400).json({ error: `${name} 必须是数组。` });
    }
    try {
      return res.json({ imported: await store.importAll({ articles, folders, wordbook }) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '数据迁移失败。' });
    }
  });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/library-api.test.js`
Expected: PASS（6 个 test 全绿）

- [ ] **Step 5: 提交**

```bash
git add server/app.js test/library-api.test.js
git commit -m "feat(api): 单词本读写与一次性迁移接口"
```

---

## Task 6: 监听回环地址、环境变量与忽略 data/

**Files:**
- Modify: `server/index.js`、`.gitignore`
- Create: `.env.example`

- [ ] **Step 1: 改启动文件**

把 `server/index.js` 的 `createApp(...).listen(...)` 段落替换为：

```js
const port = Number(process.env.PORT || 3000);
// 默认只听回环：手机通过 tailscale serve 进来，校园网/局域网里扫不到这个端口。
// 要在同一 Wi-Fi 内直连，把 .env 里的 HOST 改成 0.0.0.0 后重启。
const host = process.env.HOST || '127.0.0.1';
const apiKey = process.env.DEEPSEEK_API_KEY;
const translator = apiKey
  ? createDeepSeekClient({ apiKey })
  : {
      async translate() {
        const error = new Error('请在 .env 中配置 DEEPSEEK_API_KEY 后重启网站。');
        error.statusCode = 503;
        throw error;
      }
    };

createApp({ translator }).listen(port, host, () => {
  console.log(`六级精读工作台已启动：http://localhost:${port}`);
  if (host === '127.0.0.1') {
    console.log('手机访问：先在电脑上运行 tailscale serve --bg --https=443 http://127.0.0.1:3000，再用手机打开 tailnet 地址。');
  } else {
    console.log(`当前监听 ${host}：同一网络下的设备可用 http://<本机 IP>:${port} 访问（请自行确认防火墙与网络隔离）。`);
  }
});
```

- [ ] **Step 2: 建立环境变量样例**

创建 `.env.example`：

```env
# 复制本文件为 .env 后填入自己的密钥
DEEPSEEK_API_KEY=sk-你的真实密钥
PORT=3000
# 只监听回环地址（配合 tailscale serve 使用）；局域网直连改成 0.0.0.0
HOST=127.0.0.1
# 文章库与单词本的落盘目录
DATA_DIR=./data
```

- [ ] **Step 3: 忽略数据目录**

把 `.gitignore` 内容改为（新增一行 `data/`）：

```
node_modules/
.env
*.log
data/
```

- [ ] **Step 4: 手工验证监听地址与 data 落盘**

Run: `npm start`
Expected: 打印 `六级精读工作台已启动：http://localhost:3000` 和手机访问提示。
另开一个终端 Run:
```powershell
Invoke-RestMethod -Method Put -Uri http://127.0.0.1:3000/api/library/articles/a1 -ContentType 'application/json' -Body '{"id":"a1","article":"Hello world.","title":"测试","updatedAt":"2026-10-11T00:00:00.000Z"}'
Get-ChildItem data
```
Expected: 返回 `article` 对象；`data` 目录里出现 `library.json`；再执行 `git status --short` 时**看不到** `data/`（已被忽略）。

- [ ] **Step 5: 提交**

```bash
git add server/index.js .env.example .gitignore
git commit -m "feat(server): 默认只监听回环地址并补环境变量样例"
```

---

## Task 7: 前端 HTTP 客户端 `library-api.js`

**Files:**
- Create: `public/js/library-api.js`
- Test: `test/library-api-client.test.js`

- [ ] **Step 1: 写失败的测试**

创建 `test/library-api-client.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLibrary, putArticle, subscribeServerStatus, putWordbook } from '../public/js/library-api.js';

// 用 stub 换掉 globalThis.fetch：客户端唯一的副作用就是这个全局函数。
function withStubFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return Promise.resolve()
    .then(() => run(calls))
    .finally(() => { globalThis.fetch = original; });
}

test('fetchLibrary 打到 /api/library 并返回解析后的 body', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [{ id: 'a1' }], folders: [] }), { status: 200 }),
    async (calls) => {
      const result = await fetchLibrary();
      assert.deepEqual(result.articles, [{ id: 'a1' }]);
      assert.equal(calls[0].url, '/api/library');
      assert.equal(calls[0].options.method, undefined);
    }
  );
});

test('putArticle 用 PUT 打到带 id 的地址并带 JSON 头', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ article: { id: 'a1' } }), { status: 200 }),
    async (calls) => {
      await putArticle({ id: 'a1', article: 'Hello.' });
      assert.equal(calls[0].url, '/api/library/articles/a1');
      assert.equal(calls[0].options.method, 'PUT');
      assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(calls[0].options.body), { id: 'a1', article: 'Hello.' });
    }
  );
});

test('putWordbook 把数组包进 entries 字段', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ ok: true, saved: 1 }), { status: 200 }),
    async (calls) => {
      await putWordbook([{ word: 'hello' }]);
      assert.equal(calls[0].url, '/api/wordbook');
      assert.deepEqual(JSON.parse(calls[0].options.body), { entries: [{ word: 'hello' }] });
    }
  );
});

test('网络不可达时抛中文文案并把在线状态切到离线', async () => {
  const seen = [];
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(() => fetchLibrary(), { message: /未连接到电脑服务器/ });
  });
  unsubscribe();
  assert.deepEqual(seen, [true, false]);
});

test('服务端 500 时抛服务端错误文案，但状态仍是在线', async () => {
  // 模块级的在线状态会在同一文件的 test 之间保留（上一个 test 把它切成了离线），
  // 所以先用一次成功请求复位，再断言 500 不会把它判成离线。
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [], folders: [] }), { status: 200 }),
    () => fetchLibrary()
  );
  const seen = [];
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(
    () => new Response(JSON.stringify({ error: '文章库文件无法解析：/tmp/library.json' }), { status: 500 }),
    async () => {
      await assert.rejects(() => fetchLibrary(), { message: /无法解析/ });
    }
  );
  unsubscribe();
  assert.deepEqual(seen, [true]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/library-api-client.test.js`
Expected: FAIL — `Cannot find module '.../public/js/library-api.js'`

- [ ] **Step 3: 实现客户端**

创建 `public/js/library-api.js`：

```js
const jsonHeaders = { 'Content-Type': 'application/json' };

const listeners = new Set();
let online = true;

// 服务器在线状态：任何请求都能翻转它，界面据此显示/隐藏“未连接”提示条。
export function subscribeServerStatus(handler) {
  listeners.add(handler);
  handler(online);
  return () => listeners.delete(handler);
}

function setOnline(next) {
  if (next === online) return;
  online = next;
  listeners.forEach((handler) => handler(online));
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    setOnline(false);
    throw new Error('未连接到电脑服务器，数据未同步。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // 能拿到响应就说明服务器在线，只是这次请求失败了。
    setOnline(true);
    throw new Error(body.error || '服务器请求失败，请稍后重试。');
  }
  setOnline(true);
  return response.json();
}

export function fetchLibrary() {
  return requestJson('/api/library');
}

export function putArticle(article) {
  return requestJson(`/api/library/articles/${encodeURIComponent(article.id)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(article)
  });
}

export function deleteArticle(id) {
  return requestJson(`/api/library/articles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function putFolder(folder) {
  return requestJson(`/api/library/folders/${encodeURIComponent(folder.id)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(folder)
  });
}

export function deleteFolder(id) {
  return requestJson(`/api/library/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchWordbook() {
  return requestJson('/api/wordbook');
}

export function putWordbook(entries) {
  return requestJson('/api/wordbook', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ entries }) });
}

export function importLocalData(payload) {
  return requestJson('/api/library/import', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/library-api-client.test.js`
Expected: PASS（5 个 test 全绿）

- [ ] **Step 5: 提交**

```bash
git add public/js/library-api.js test/library-api-client.test.js
git commit -m "feat(web): 新增 Library HTTP 客户端与在线状态订阅"
```

---

## Task 8: 文章库适配层改为服务端，旧 IndexedDB 实现留存为 legacy

**Files:**
- Create: `public/js/legacy-library.js`
- Modify: `public/js/article-library.js`
- Test: `test/article-library-adapter.test.js`

- [ ] **Step 1: 把旧实现整体搬到 legacy 模块**

用 `public/js/article-library.js` 的**当前内容**创建 `public/js/legacy-library.js`，做两处改名：`listArticles` → `listLegacyArticles`、`listFolders` → `listLegacyFolders`（其余 `getArticle` / `saveArticle` / `deleteArticle` / `createFolder` / `deleteFolder` 与内部函数原样保留，因为迁移只用到「列出」），并在文件末尾追加旧单词本的读取函数：

```js
const legacyWordbookKey = 'cet6:wordbook';

// 旧版本把单词本存在 localStorage 里，迁移时读一次就够了。
export function readLegacyWordbook() {
  try {
    const data = JSON.parse(localStorage.getItem(legacyWordbookKey) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
```

注意：`public/js/legacy-library.js` 里未改名的 `getArticle` / `saveArticle` / `deleteArticle` / `createFolder` / `deleteFolder` 会与 `article-library.js` 同名但来源不同，**不要**让 `app.js` 从 legacy 模块导入这些名字，避免误用旧实现。

- [ ] **Step 2: 写适配层失败的测试**

创建 `test/article-library-adapter.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFolder, getArticle, listArticles, listFolders, saveArticle } from '../public/js/article-library.js';

function withStubFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return Promise.resolve()
    .then(() => run(calls))
    .finally(() => { globalThis.fetch = original; });
}

test('listArticles 按 updatedAt 降序（与旧 IndexedDB 契约一致）', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({
      articles: [
        { id: 'old', article: 'Old.', updatedAt: '2026-10-01T00:00:00.000Z' },
        { id: 'new', article: 'New.', updatedAt: '2026-10-11T00:00:00.000Z' }
      ],
      folders: []
    }), { status: 200 }),
    async () => {
      assert.deepEqual((await listArticles()).map((record) => record.id), ['new', 'old']);
    }
  );
});

test('listFolders 按 createdAt 升序', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({
      articles: [],
      folders: [
        { id: 'f2', name: '后建', createdAt: '2026-10-11T00:00:00.000Z' },
        { id: 'f1', name: '先建', createdAt: '2026-10-01T00:00:00.000Z' }
      ]
    }), { status: 200 }),
    async () => {
      assert.deepEqual((await listFolders()).map((folder) => folder.id), ['f1', 'f2']);
    }
  );
});

test('getArticle 未命中时解析为 undefined 而不是抛错', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [{ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' }], folders: [] }), { status: 200 }),
    async () => {
      assert.equal(await getArticle('missing'), undefined);
      assert.equal((await getArticle('a1')).article, 'One.');
    }
  );
});

test('createFolder 解析出新文件夹的 id（app.js:1297 依赖这个契约）', async () => {
  await withStubFetch(
    (url, options) => {
      if (url === '/api/library') return new Response(JSON.stringify({ articles: [], folders: [] }), { status: 200 });
      return new Response(JSON.stringify({ folder: JSON.parse(options.body) }), { status: 200 });
    },
    async (calls) => {
      const id = await createFolder('  真题听力  ');
      assert.equal(typeof id, 'string');
      assert.ok(id.startsWith('folder-') || id.length > 10);
      const putCall = calls.find((call) => call.options.method === 'PUT');
      assert.equal(putCall.url, `/api/library/folders/${id}`);
      assert.deepEqual(JSON.parse(putCall.options.body).name, '真题听力');
    }
  );
});

test('saveArticle 返回服务器落库后的记录', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ article: { id: 'a1', article: 'One.', title: '服务器标题' } }), { status: 200 }),
    async () => {
      const saved = await saveArticle({ id: 'a1', article: 'One.' });
      assert.equal(saved.title, '服务器标题');
    }
  );
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test test/article-library-adapter.test.js`
Expected: FAIL — 现在 `listArticles()` 走的是 IndexedDB，Node 里没有 `indexedDB`，报「当前浏览器不支持本地文章库。」

- [ ] **Step 4: 改写适配层**

把 `public/js/article-library.js` 整个文件替换为：

```js
import { deleteArticle as deleteArticleRemote, deleteFolder as deleteFolderRemote, fetchLibrary, putArticle, putFolder } from './library-api.js';

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 契约与旧 IndexedDB 版本完全一致，所以 app.js 的调用点不用改：
// 文章按 updatedAt 降序、文件夹按 createdAt 升序、getArticle 未命中 resolve undefined、
// createFolder 解析出新文件夹 id、saveArticle 解析出落库后的记录。
export async function listArticles() {
  const { articles } = await fetchLibrary();
  return [...articles].sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
}

export async function getArticle(id) {
  const { articles } = await fetchLibrary();
  return articles.find((record) => record.id === id);
}

export async function saveArticle(record) {
  const { article } = await putArticle(record);
  return article;
}

export async function deleteArticle(id) {
  await deleteArticleRemote(id);
}

export async function listFolders() {
  const { folders } = await fetchLibrary();
  return [...folders].sort((left, right) => String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')));
}

export async function createFolder(name) {
  const folder = { id: createId('folder'), name: String(name).trim(), createdAt: new Date().toISOString() };
  await putFolder(folder);
  // 只返回 id：app.js 用 `typeof created === 'string'` 分支处理，契约与 IDB 版一致。
  return folder.id;
}

export async function deleteFolder(id) {
  await deleteFolderRemote(id);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/article-library-adapter.test.js`
Expected: PASS（5 个 test 全绿）

- [ ] **Step 6: 提交**

```bash
git add public/js/article-library.js public/js/legacy-library.js test/article-library-adapter.test.js
git commit -m "feat(web): 文章库改为服务端适配层，旧 IndexedDB 实现留存供迁移"
```

---

## Task 9: `app.js` 单词本改为服务端持久化

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: 改导入与初始状态**

把 `public/js/app.js` 第 6 行之后追加两行导入（`article-library.js` 的导入保持原样）：

```js
import { fetchWordbook, importLocalData, putWordbook, subscribeServerStatus } from './library-api.js';
import { listLegacyArticles, listLegacyFolders, readLegacyWordbook } from './legacy-library.js';
```

把 `state` 里的 `entries: readWordbook(),` 改为 `entries: [],`，并删除下面这两个函数（`readWordbook` 与它的 `storageKeys.wordbook` 依赖；`readHighlights` 保留不动）：

```js
function readWordbook() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKeys.wordbook) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: 新增服务端单词本读写**

在 `normalizeWord` 函数之前插入：

```js
let wordbookWriteChain = Promise.resolve();

// 写入串行化 + 快照：旧响应晚到也不会用过期数据覆盖新数据。
function persistWordbook() {
  const snapshot = JSON.parse(JSON.stringify(state.entries));
  wordbookWriteChain = wordbookWriteChain
    .catch(() => {})
    .then(() => putWordbook(snapshot))
    .catch((error) => setReaderStatus(error.message));
  return wordbookWriteChain;
}

async function loadWordbook() {
  try {
    const { entries } = await fetchWordbook();
    state.entries = Array.isArray(entries) ? entries : [];
  } catch (error) {
    setReaderStatus(error.message);
    state.entries = [];
  }
  renderWordbook();
}
```

- [ ] **Step 3: 把 4 处 localStorage 写入换成服务端写入**

四处替换（行号以当前文件为准，替换内容一致）：

`saveWord()` 里（原第 855 行）：
```js
  localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
```
改为：
```js
  await persistWordbook();
```

`updateWordEntry()` 里（原第 863 行）把同一行改为：
```js
  persistWordbook();
```

`renderWordbook()` 里短语行删除按钮（原第 1063 行）：
```js
      remove.addEventListener('click', () => { state.entries = state.entries.filter((item) => item.word !== entry.word); localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries)); renderWordbook(); });
```
改为：
```js
      remove.addEventListener('click', () => { state.entries = state.entries.filter((item) => item.word !== entry.word); persistWordbook(); renderWordbook(); });
```

`renderWordDetail()` 里「从单词本移除」（原第 1119-1120 行）：
```js
    state.entries = state.entries.filter((item) => item.word !== entry.word);
    localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
```
改为：
```js
    state.entries = state.entries.filter((item) => item.word !== entry.word);
    persistWordbook();
```

替换完成后 Run: `grep -n "storageKeys.wordbook" public/js/app.js`
Expected: 输出只剩 `storageKeys` 定义里的那一行（`wordbook: 'cet6:wordbook',`）；若还有别处，说明漏改。

- [ ] **Step 4: 启动时拉取单词本**

把文件末尾的

```js
renderWordbook();
renderArticleLibrary();
```

改为

```js
renderWordbook();
renderArticleLibrary();
await loadWordbook();
```

- [ ] **Step 5: 手工验证**

Run: `npm start` → 浏览器打开 `http://localhost:3000` → F12 网络面板确认启动时有 `GET /api/wordbook`；点击一个词并「加入单词本」后确认发出 `PUT /api/wordbook`，且 `data/library.json` 的 `wordbook` 数组里出现了该词。
Expected: 单词本写入服务器，刷新页面后单词仍在。

- [ ] **Step 6: 提交**

```bash
git add public/js/app.js
git commit -m "feat(web): 单词本改由服务端持久化并在启动时拉取"
```

---

## Task 10: 迁移入口与断连提示条

**Files:**
- Modify: `public/index.html`、`public/js/app.js`、`public/styles.css`

- [ ] **Step 1: 加提示条与迁移区块**

在 `public/index.html` 的 `<div class="grain" aria-hidden="true"></div>` 之后插入提示条：

```html
    <p id="server-status" class="server-status" role="status" hidden>未连接到电脑服务器，数据未同步。请确认电脑已开机、本机服务已启动，并且手机已连上 Tailscale。</p>
```

在 `#article-library-list` 那一行之后、`</section>` 之前插入迁移区块：

```html
          <div id="library-sync" class="library-sync">
            <p class="eyebrow">DEVICE SYNC</p>
            <h3>数据同步</h3>
            <p class="sync-hint">文章与单词本保存在这台电脑上。手机打开同一地址就能看到同一份数据。</p>
            <button id="upload-local-data" class="quiet-button" type="button">把本机数据上传到服务器</button>
            <p id="sync-message" class="form-message" role="status"></p>
          </div>
```

- [ ] **Step 2: 加样式**

在 `public/styles.css` 末尾追加：

```css
.server-status { position: sticky; top: 0; z-index: 30; margin: 0; padding: 10px 18px; color: #3d1f16; background: var(--marker); font-size: 13px; text-align: center; }
.library-sync { margin-top: 34px; padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255, 255, 255, .35); }
html[data-theme="dark"] .library-sync { background: rgba(255, 255, 255, .04); }
.library-sync h3 { margin: 6px 0 8px; font: 700 18px var(--serif); }
.library-sync .sync-hint { margin: 0 0 14px; color: var(--ink-soft); font-size: 13px; }
.library-sync .quiet-button.is-highlighted { padding: 9px 16px; border-radius: 999px; color: var(--paper); background: var(--green); }
```

- [ ] **Step 3: 接线 `app.js`**

在 `elements` 对象里 `libraryMount` 之后补三个元素引用：

```js
  serverStatus: document.querySelector('#server-status'),
  uploadLocalData: document.querySelector('#upload-local-data'),
  syncMessage: document.querySelector('#sync-message'),
```

在 `renderArticleLibrary()` 里，`renderFolderShelf(folders, articles);` 之后插入高亮逻辑：

```js
    // 服务器库还是空的，说明本机浏览器里可能有一批待迁移的老数据，把上传按钮点亮。
    elements.uploadLocalData.classList.toggle('is-highlighted', articles.length === 0);
```

在 `createFolderFromInput()` 函数之前插入迁移处理与状态订阅：

```js
function setSyncMessage(message, success = false) {
  elements.syncMessage.textContent = message;
  elements.syncMessage.classList.toggle('is-success', success);
}

async function uploadLocalData() {
  elements.uploadLocalData.disabled = true;
  setSyncMessage('正在读取本机数据…');
  try {
    const [articles, folders] = await Promise.all([listLegacyArticles(), listLegacyFolders()]);
    const wordbook = readLegacyWordbook();
    const { imported } = await importLocalData({ articles, folders, wordbook });
    setSyncMessage(`已上传 ${imported.articles} 篇、${imported.wordbook} 个词。本机数据仍保留在原浏览器里，可随时回退。`, true);
    await loadWordbook();
    await renderArticleLibrary();
  } catch (error) {
    setSyncMessage(error.message);
  } finally {
    elements.uploadLocalData.disabled = false;
  }
}

subscribeServerStatus((isOnline) => {
  elements.serverStatus.hidden = isOnline;
});
```

在文件末尾的事件绑定区（`elements.createFolder.addEventListener(...)` 附近）补：

```js
elements.uploadLocalData.addEventListener('click', uploadLocalData);
```

- [ ] **Step 4: 手工验证**

Run: `npm start` → 浏览器打开 `http://localhost:3000` → 进入「我的精读」。
Expected:
1. 库为空时「把本机数据上传到服务器」是绿色高亮；点击后提示「已上传 N 篇、M 个词。」，列表出现文章。
2. `data/library.json` 里能看到这些文章。
3. 停掉服务（Ctrl+C）后刷新页面，页面顶部出现黄色「未连接到电脑服务器」提示条；重启服务后刷新，提示条消失。

- [ ] **Step 5: 提交**

```bash
git add public/index.html public/styles.css public/js/app.js
git commit -m "feat(web): 数据迁移入口与服务器断连提示条"
```

---

## Task 11: PWA 清单与图标

**Files:**
- Create: `public/manifest.webmanifest`、`public/icons/icon-192.png`、`public/icons/icon-512.png`、`public/icons/apple-touch-icon.png`
- Modify: `public/index.html`

- [ ] **Step 1: 生成图标**

Run（PowerShell，工作目录为本仓库根目录）：

```powershell
Add-Type -AssemblyName System.Drawing
$outDir = Join-Path (Get-Location) 'public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
function New-Cet6Icon([int]$size, [string]$file) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(246, 240, 228))
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(23, 105, 90))
  $font = New-Object System.Drawing.Font('Microsoft YaHei', [single]($size * 0.54), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('阅', $font, $brush, (New-Object System.Drawing.RectangleF(0, 0, $size, $size)), $format)
  $bitmap.Save((Join-Path $outDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $font.Dispose(); $brush.Dispose(); $bitmap.Dispose()
}
New-Cet6Icon 192 'icon-192.png'
New-Cet6Icon 512 'icon-512.png'
New-Cet6Icon 180 'apple-touch-icon.png'
Get-ChildItem $outDir | Select-Object Name, Length
```

Expected: 三个 PNG 文件，`icon-192.png` 与 `apple-touch-icon.png` 大小在几 KB 以内，`icon-512.png` 稍大且都不是 0 字节。

- [ ] **Step 2: 写清单**

创建 `public/manifest.webmanifest`：

```json
{
  "name": "六级精读工作台",
  "short_name": "精读",
  "description": "在自己电脑上运行的六级英语精读与单词本",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f6f0e4",
  "theme_color": "#17695a",
  "lang": "zh-CN",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: 挂到页面**

在 `public/index.html` 的 `<link rel="stylesheet" href="/styles.css" />` 之后插入：

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="theme-color" content="#17695a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="精读" />
```

- [ ] **Step 4: 手工验证**

Run: `npm start`，浏览器打开 `http://localhost:3000/manifest.webmanifest`
Expected: 返回 JSON（不是 404），且 `http://localhost:3000/icons/icon-192.png` 能直接看到绿色「阅」图标。

- [ ] **Step 5: 提交**

```bash
git add public/manifest.webmanifest public/icons public/index.html
git commit -m "feat(web): 可添加到主屏幕的 PWA 清单与图标"
```

---

## Task 12: README 手机访问章节

**Files:**
- Modify: `README.md`（整篇重写）

- [ ] **Step 1: 重写 README**

把 `README.md` 替换为：

```markdown
# 六级英语精读工作台

在自己电脑上运行的英语文章精读网站。支持逐词释义、短语/句子/段落翻译、本地单词本以及 Markdown / Word 导出。
文章库与单词本保存在**电脑上**（`data/library.json`），因此手机、平板、其他浏览器打开同一地址时看到的是同一份数据。

## 首次运行

1. 将 `.env.example` 复制为 `.env`，填入自己的 DeepSeek API Key：

   ```env
   DEEPSEEK_API_KEY=sk-你的真实密钥
   PORT=3000
   HOST=127.0.0.1
   DATA_DIR=./data
   ```

2. 在本目录执行：

   ```powershell
   npm install
   npm start
   ```

3. 在浏览器打开 [http://localhost:3000](http://localhost:3000)。

4. 如果以前用旧版本存过文章（浏览器 IndexedDB）或单词本（localStorage）：打开「我的精读」，点击**把本机数据上传到服务器**。
   上传是合并式的——文章按 `updatedAt` 取较新的一方，单词本只补服务器上还没有的词；浏览器里的旧数据不会被删除。

## 手机访问（Tailscale 私有组网）

只有你自己的设备能访问，不需要公网 IP，也不用改路由器；在校园网/公共 Wi-Fi 下不会向同网设备开放任何端口。

1. **电脑**：安装并登录 Tailscale（需要管理员权限）

   ```powershell
   winget install --id Tailscale.Tailscale
   tailscale up
   ```

2. **Tailscale 管理后台** → DNS 页面 → 开启 **HTTPS Certificates**（`tailscale serve` 需要它才能签发证书）。

3. **电脑**：把本机 3000 端口反代到 tailnet 的 HTTPS 地址

   ```powershell
   tailscale serve --bg --https=443 http://127.0.0.1:3000
   tailscale serve status
   ```

   `status` 会给出形如 `https://<电脑名>.<tailnet 名>.ts.net` 的地址。

4. **手机**：安装 Tailscale App，登录**同一个账号**并连接，然后用浏览器打开上面那个地址。

5. **加桌面图标**：Android Chrome 菜单 → 添加到主屏幕；iOS Safari → 共享 → 添加到主屏幕。打开后是全屏的应用样式。

6. **电源计划**：控制面板 → 电源选项 → 更改计划设置 → 把「使计算机进入睡眠状态」改为**从不**（至少在插电时），否则电脑睡眠后手机就连不上了。

### 常见故障

| 现象 | 原因与处理 |
| --- | --- |
| 手机打开地址报「无法访问此网站」 | 手机上的 Tailscale 没连接；或电脑上的 Tailscale 服务没登录（`tailscale status` 检查）。 |
| 页面能开但顶部显示「未连接到电脑服务器」 | 电脑上的 `npm start` 没在跑，或端口被占用。 |
| `tailscale serve` 报证书相关错误 | 管理后台的 HTTPS Certificates 没开，或电脑名含不支持的字符。 |
| 手机能开、但打开文章报错 | 看电脑终端里 Node 打印的错误；`data/library.json` 若损坏会明确报出文件路径。 |

### 想在局域网内直连（可选）

把 `.env` 里的 `HOST` 改成 `0.0.0.0` 后重启，手机用 `http://<电脑 IP>:3000` 访问。
注意：这会让同一网络下的其他设备也能访问，公共/校园网络里不安全，仅建议在家用路由器下临时使用。

## 安全说明

- 不要把 `.env`、API Key 或浏览器控制台截图发给任何人；如果曾经发过，去 DeepSeek 后台重置密钥。
- 网页只请求本机服务；DeepSeek Key 仅由电脑上的 Node 服务读取，不会下发到手机。
- 访问控制由 Tailscale 负责：只有登录了同一账号的设备才在同一个 tailnet 里。若以后要把网址分享给别人，需要另行加一层应用密码。
- `data/` 已在 `.gitignore` 中，文章与单词本不会进 git。

## 测试

```powershell
npm test
```
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: 手机访问（Tailscale）与服务端数据说明"
```

---

## Task 13: 端到端验证

**Files:** 无代码改动（只做验证；如发现问题，回到对应任务修复）

- [ ] **Step 1: 全量单测**

Run: `npm test`
Expected: 全部 PASS，其中新增 4 个测试文件：`store.test.js`(9)、`library-api.test.js`(6)、`library-api-client.test.js`(5)、`article-library-adapter.test.js`(5)。

- [ ] **Step 2: 服务端落盘端到端（模拟第二台设备）**

在一个终端 Run: `npm start`
在另一个终端依次 Run：

```powershell
Invoke-RestMethod -Method Put -Uri http://127.0.0.1:3000/api/library/articles/e2e1 -ContentType 'application/json' -Body '{"id":"e2e1","article":"Reading critically helps.","title":"端到端","category":"短篇阅读","folderId":"","updatedAt":"2026-10-11T00:00:00.000Z"}'
Invoke-RestMethod -Method Put -Uri http://127.0.0.1:3000/api/wordbook -ContentType 'application/json' -Body '{"entries":[{"word":"critically","meaning":"批判性地"}]}'
```

然后用 Ctrl+C 停掉服务、重新 `npm start`，再 Run：

```powershell
(Invoke-RestMethod -Uri http://127.0.0.1:3000/api/library).articles | Select-Object id, title
(Invoke-RestMethod -Uri http://127.0.0.1:3000/api/wordbook).entries | Select-Object word, meaning
```

Expected: 重启后仍能读到 `e2e1 / 端到端` 与 `critically / 批判性地` —— 证明数据确实落在电脑上而不是浏览器里。

- [ ] **Step 3: 浏览器侧「换设备」验证**

1. 浏览器打开 `http://localhost:3000`，F12 → Application → Clear site data（清空 IndexedDB 与 localStorage），刷新。
2. Expected: 「我的精读」里仍能看到 `端到端` 这篇文章，单词本里仍有 `critically`。
3. 确认访问过程中 `data/library.json` 被正确更新（`Get-Content data/library.json | Select-Object -First 20`）。

- [ ] **Step 4: 清理测试数据**

```powershell
Invoke-RestMethod -Method Delete -Uri http://127.0.0.1:3000/api/library/articles/e2e1
Invoke-RestMethod -Method Put -Uri http://127.0.0.1:3000/api/wordbook -ContentType 'application/json' -Body '{"entries":[]}'
```

- [ ] **Step 5: 交给用户做的最终验收**

在电脑上执行 Task 12 README 里的第 1–5 步，用手机打开 tailnet 地址，确认：能打开网站、能看到电脑上的文章与单词本、能点词翻译、能添加到主屏幕。

---

## Self-Review 记录

**Spec 覆盖检查**

| Spec 要求 | 对应任务 |
| --- | --- |
| A 组网：Node 只监听回环 + `HOST` 配置 | Task 6 |
| A 组网：手机端 Tailscale / `tailscale serve` 步骤 | Task 12（文档）+ Task 13 Step 5（验收） |
| B 存储：`data/library.json`、懒加载、原子写、损坏即报错、串行写 | Task 1、Task 2 |
| B 存储：8 个 REST 路由与校验、`detached`、`import` 合并语义 | Task 4、Task 5 |
| C 前端：`library-api.js` + 适配层契约不变 + `createFolder` 返回 id | Task 7、Task 8 |
| C 前端：单词本 4 处写入收敛为 `persistWordbook` + 启动拉取 | Task 9 |
| C 前端：迁移区块 + 断连提示条 + 不改浏览器旧数据 | Task 10 |
| D PWA：manifest、三个图标、head 元信息、不做 Service Worker | Task 11 |
| E 配置与运维：`.env.example`、`DATA_DIR`、忽略 `data/`、README 章节、安全说明 | Task 6、Task 12 |
| 测试：store / 路由 / 客户端 / 适配层 + 既有测试不回归 | Task 1–5、7、8、13 |
| 范围约束：不做多用户、不做离线缓存、不迁移预热缓存、不做续读位置同步 | 全计划未涉及，符合约束 |

**占位符扫描:** 无 TBD / TODO；每个改代码的步骤都给了可直接粘贴的完整代码或完整 `git`/`npm`/`PowerShell` 命令。

**类型与命名一致性检查:**
- 存储层导出：`listArticles` / `listFolders` / `getArticle` / `getWordbook` / `putArticle` / `deleteArticle` / `putFolder` / `deleteFolder` / `putWordbook` / `importAll` —— Task 4、5 的路由与 Task 1–3 的实现逐一对齐。
- HTTP 客户端导出：`fetchLibrary` / `putArticle` / `deleteArticle` / `putFolder` / `deleteFolder` / `fetchWordbook` / `putWordbook` / `importLocalData` / `subscribeServerStatus` —— Task 8、9、10 的调用名与 Task 7 的实现一致。
- 适配层导出与旧版一致：`listArticles` / `getArticle` / `saveArticle` / `deleteArticle` / `listFolders` / `createFolder` / `deleteFolder` —— Task 8 的替换文件与 `app.js` 现有导入（第 6 行）完全对应。
- legacy 模块导出：`listLegacyArticles` / `listLegacyFolders` / `readLegacyWordbook` —— Task 8 Step 1 定义，Task 10 的 `uploadLocalData` 使用，名称一致。
- 响应字段：`{ articles, folders }`、`{ article }`、`{ folder }`、`{ ok, removed }`、`{ ok, detached }`、`{ entries }`、`{ ok, saved }`、`{ imported: { articles, folders, wordbook } }` —— Task 7 的解析与 Task 4、5 的返回一致。

**已知取舍（不修）:** `renderWordbook()` 在启动时会先渲染一次空列表再被 `loadWordbook()` 覆盖，属于一次多余的 DOM 重建，但改动 `app.js` 启动顺序的风险大于收益，保持现状。
