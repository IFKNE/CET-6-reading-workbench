# 六级英语精读工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个本机运行的六级英语精读网站，可安全调用 DeepSeek 翻译单词、短语、句子和段落，并管理、导出单词本。

**Architecture:** 浏览器从 `public/` 加载无构建步骤的 ES 模块页面；本机 Express 服务同时托管静态页面和 `/api/translate`。服务端从 `.env` 读取 DeepSeek Key，按任务类型构造提示词并请求 OpenAI 兼容接口；浏览器用 localStorage 保存文章、批注和单词本。

**Tech Stack:** Node.js、Express、dotenv、原生 HTML/CSS/JavaScript、Node 内置 `node:test`、DeepSeek Chat Completions API。

---

## 文件结构

- `package.json`：开发、测试与启动脚本；运行依赖。
- `.gitignore`：排除密钥文件与依赖目录。
- `.env.example`：只展示变量名，不包含真实密钥。
- `server/prompts.js`：每种翻译任务的 DeepSeek system/user 提示词。
- `server/deepseek.js`：DeepSeek 请求、JSON 清理与结构化单词结果校验。
- `server/app.js`：Express 应用、请求验证、错误转换和静态文件托管。
- `server/index.js`：读取环境变量并启动本机 HTTP 服务。
- `public/index.html`：粘贴页、阅读页、批注面板和单词本抽屉的语义结构。
- `public/styles.css`：纸质精读批注本视觉系统与响应式布局。
- `public/js/text.js`：保留段落的英文分词、选区分类和 HTML 转义。
- `public/js/wordbook.js`：单词本去重、localStorage 序列化和 Markdown 生成。
- `public/js/api.js`：浏览器到本机 `/api/translate` 的请求封装。
- `public/js/app.js`：页面状态、事件处理、渲染、收藏与下载操作。
- `test/prompts.test.js`：提示词范围与单词返回格式测试。
- `test/deepseek.test.js`：DeepSeek 客户端成功、解析和错误路径测试。
- `test/text.test.js`：分词与选区分类测试。
- `test/wordbook.test.js`：去重和 Markdown 导出测试。

本工作区目前没有 Git 仓库；实施时不执行提交命令，也不会初始化仓库。

### Task 1: 初始化本地项目与机密边界

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: 创建项目清单与启动命令**

在 `package.json` 写入：

```json
{
  "name": "cet6-reading-workbench",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.6.1",
    "express": "^5.1.0"
  }
}
```

- [ ] **Step 2: 创建密钥示例及忽略规则**

在 `.env.example` 写入：

```env
DEEPSEEK_API_KEY=sk-请在此处粘贴你自己的密钥
PORT=3000
```

在 `.gitignore` 写入：

```gitignore
node_modules/
.env
*.log
```

- [ ] **Step 3: 安装依赖并验证脚本被识别**

运行：`npm install`

预期：生成 `node_modules` 与锁文件，且 `npm run` 输出 `start`、`dev`、`test` 三个脚本。

### Task 2: 先用测试确定文本和单词本纯函数

**Files:**
- Create: `test/text.test.js`
- Create: `test/wordbook.test.js`
- Create: `public/js/text.js`
- Create: `public/js/wordbook.js`

- [ ] **Step 1: 写失败的文本处理测试**

在 `test/text.test.js` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraphs, tokenizeParagraph, classifySelection } from '../public/js/text.js';

test('保留非空段落并剔除首尾空白', () => {
  assert.deepEqual(splitParagraphs('  First line.\n\n Second line.  '), ['First line.', 'Second line.']);
});

test('英文单词保持标点顺序且可单独点击', () => {
  assert.deepEqual(tokenizeParagraph("Don't stop, readers!"), ["Don't", ' ', 'stop', ',', ' ', 'readers', '!']);
});

test('根据标点判断句子和短语', () => {
  assert.equal(classifySelection('A complete sentence.').scope, 'sentence');
  assert.equal(classifySelection('in the long run').scope, 'phrase');
});
```

- [ ] **Step 2: 写失败的单词本测试**

在 `test/wordbook.test.js` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrUpdateWord, createMarkdown } from '../public/js/wordbook.js';

test('同一词形更新而不是重复收藏', () => {
  const first = addOrUpdateWord([], { word: 'study', meaning: '学习', partOfSpeech: 'v.', context: 'I study every day.', savedAt: '2026-10-05' });
  const second = addOrUpdateWord(first, { word: 'Study', meaning: '研究', partOfSpeech: 'n.', context: 'The study is useful.', savedAt: '2026-10-05' });
  assert.equal(second.length, 1);
  assert.equal(second[0].meaning, '研究');
});

test('导出的 Markdown 包含词义和原句', () => {
  const markdown = createMarkdown([{ word: 'study', meaning: '学习', partOfSpeech: 'v.', context: 'I study every day.', savedAt: '2026-10-05' }], '2026-10-05');
  assert.match(markdown, /## study/);
  assert.match(markdown, /- 释义：v\. 学习/);
  assert.match(markdown, /> I study every day\./);
});
```

- [ ] **Step 3: 运行测试确认失败**

运行：`npm test`

预期：失败信息指出 `text.js` 与 `wordbook.js` 尚不存在。

- [ ] **Step 4: 实现最小文本模块**

在 `public/js/text.js` 导出以下函数：

```js
export function splitParagraphs(article) {
  return article.split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function tokenizeParagraph(paragraph) {
  return paragraph.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\s+|[^A-Za-z\s]/g) ?? [];
}

export function classifySelection(text) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return { text: trimmed, scope: /[.!?。！？]$/.test(trimmed) ? 'sentence' : 'phrase' };
}
```

- [ ] **Step 5: 实现单词本模块**

在 `public/js/wordbook.js` 导出以下函数：

```js
export function addOrUpdateWord(entries, entry) {
  const key = entry.word.toLowerCase();
  const next = entries.filter((item) => item.word.toLowerCase() !== key);
  return [{ ...entry, word: entry.word.toLowerCase() }, ...next];
}

export function createMarkdown(entries, exportedAt) {
  const rows = ['# 六级精读单词本', '', `导出日期：${exportedAt}`, ''];
  for (const item of entries) {
    rows.push(`## ${item.word}`, '', `- 释义：${item.partOfSpeech} ${item.meaning}`, `- 收藏日期：${item.savedAt}`, '', `> ${item.context}`, '');
  }
  return rows.join('\n');
}
```

- [ ] **Step 6: 运行纯函数测试**

运行：`npm test`

预期：`text.test.js` 与 `wordbook.test.js` 的 5 个断言全部通过。

### Task 3: 用测试建立 DeepSeek 翻译服务

**Files:**
- Create: `test/prompts.test.js`
- Create: `test/deepseek.test.js`
- Create: `server/prompts.js`
- Create: `server/deepseek.js`

- [ ] **Step 1: 写失败的提示词测试**

在 `test/prompts.test.js` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../server/prompts.js';

test('单词任务要求按词性和常见度返回 JSON', () => {
  const messages = buildMessages({ scope: 'word', text: 'address', context: 'Please address the issue.' });
  assert.match(messages[0].content, /最高频/);
  assert.match(messages[0].content, /partOfSpeech/);
  assert.match(messages[1].content, /Please address the issue/);
});

test('段落任务要求自然中文译文', () => {
  const messages = buildMessages({ scope: 'paragraph', text: 'Reading improves critical thinking.' });
  assert.match(messages[0].content, /自然、准确的中文/);
  assert.match(messages[1].content, /Reading improves/);
});
```

- [ ] **Step 2: 写失败的客户端测试**

在 `test/deepseek.test.js` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeepSeekClient } from '../server/deepseek.js';

test('单词结果移除 Markdown 代码围栏并解析 JSON', async () => {
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '```json\\n{"word":"address","senses":[]}\\n```' } }] }), { status: 200 }) });
  const result = await client.translate({ scope: 'word', text: 'address', context: '' });
  assert.equal(result.kind, 'word');
  assert.equal(result.data.word, 'address');
});

test('上游失败转换为带状态码的错误', async () => {
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl: async () => new Response('额度不足', { status: 429 }) });
  await assert.rejects(() => client.translate({ scope: 'phrase', text: 'in fact' }), { message: /DeepSeek 请求失败/ });
});
```

- [ ] **Step 3: 运行测试确认失败**

运行：`npm test`

预期：失败信息指出 `server/prompts.js` 和 `server/deepseek.js` 尚不存在。

- [ ] **Step 4: 实现任务提示词**

在 `server/prompts.js` 中实现 `buildMessages({ scope, text, context = '' })`。`word` 的 system 内容必须要求返回无 Markdown 的 JSON：

```json
{
  "word": "原词",
  "lemma": "词元",
  "pronunciation": "音标或空字符串",
  "contextMeaning": "当前语境最可能的中文意思",
  "senses": [{"partOfSpeech":"v.","meaning":"处理；应对","frequency":"最高频"}]
}
```

并要求：先按 `partOfSpeech` 分组，再按 `最高频`、`常见`、`较少见` 排列。`phrase`、`sentence`、`paragraph` 任务使用“将以下英文译为自然、准确的中文，只返回译文”的 system 内容，user 内容为 `原文：${text}`。

- [ ] **Step 5: 实现 DeepSeek 客户端**

在 `server/deepseek.js` 实现 `createDeepSeekClient({ apiKey, fetchImpl = fetch })`，其 `translate(input)` 方法：调用 `buildMessages(input)`；向 `https://api.deepseek.com/chat/completions` 发送 JSON；使用模型 `deepseek-flash`、`temperature: 0.2`；对非 2xx 响应抛出 `new Error('DeepSeek 请求失败（状态码：' + response.status + '）')`；单词任务移除 ```` ```json ```` 或 ```` ``` ```` 围栏后解析 JSON 并返回 `{ kind: 'word', data }`；其他任务返回 `{ kind: 'translation', translation: content.trim() }`。

- [ ] **Step 6: 运行 DeepSeek 模块测试**

运行：`npm test`

预期：提示词和客户端共 4 个测试通过；前两组纯函数测试继续通过。

### Task 4: 用测试实现安全的本机 API

**Files:**
- Create: `server/app.js`
- Create: `server/index.js`
- Modify: `test/deepseek.test.js`

- [ ] **Step 1: 为 API 路由写失败测试**

在 `test/deepseek.test.js` 追加：

```js
import request from 'supertest';
import { createApp } from '../server/app.js';

test('无效 scope 返回 400 而不调用翻译客户端', async () => {
  const app = createApp({ translator: { translate: async () => { throw new Error('不应调用'); } } });
  const response = await request(app).post('/api/translate').send({ scope: 'page', text: 'hello' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /scope/);
});
```

- [ ] **Step 2: 补充测试依赖并确认失败**

运行：`npm install --save-dev supertest && npm test`

预期：测试因 `server/app.js` 尚不存在而失败。

- [ ] **Step 3: 实现 Express 应用**

在 `server/app.js` 导出 `createApp({ translator })`。应用须使用 `express.json({ limit: '20kb' })`，定义 `POST /api/translate`；只允许 `word`、`phrase`、`sentence`、`paragraph` 四种 scope，要求 `text` 为 1 至 10000 个字符的字符串，并把可选 `context` 截断为 2000 字符。成功时返回翻译客户端结果；客户端错误时返回 `{ error: error.message }` 及状态码 `502`。最后用 `express.static('public')` 托管页面。

- [ ] **Step 4: 实现启动入口**

在 `server/index.js` 中使用 `dotenv/config`，读取 `process.env.DEEPSEEK_API_KEY`。没有 Key 时启动服务但使 `/api/translate` 返回 `503` 和“请在 .env 中配置 DEEPSEEK_API_KEY”；有 Key 时创建 `createDeepSeekClient({ apiKey })`，将 `createApp({ translator })` 监听在 `process.env.PORT || 3000`。

- [ ] **Step 5: 运行完整后端测试**

运行：`npm test`

预期：所有测试通过，非法 scope 的路由测试返回 400。

### Task 5: 创建可阅读、可批注的页面骨架

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`

- [ ] **Step 1: 创建具备可访问性标记的页面结构**

在 `public/index.html` 建立以下具备稳定 id 的元素：`#paste-view`、`#article-input`、`#open-reader`、`#demo-article`、`#reader-view`、`#reader-content`、`#selection-actions`、`#annotation-panel`、`#wordbook-drawer`、`#wordbook-list`、`#export-wordbook`。使用 `main`、`section`、`aside`、`button` 和 `aria-live="polite"`；阅读页初始用 `hidden` 隐藏。

- [ ] **Step 2: 实现纸质精读批注本视觉风格**

在 `public/styles.css` 定义 `--paper: #f6f0e4`、`--ink: #22312b`、`--green: #17695a`、`--marker: #ecd66e`。采用有衬线正文和高可读无衬线界面字体；阅读正文行高不低于 `1.9`；可点击单词 `.word-token` 有透明背景、悬停时出现荧光笔效果；段落翻译按钮默认低调；批注侧栏在桌面固定、窄屏时变为正文下方区域。用户键盘聚焦控件必须有可见焦点环。

- [ ] **Step 3: 本机人工检查**

运行：`npm start`

访问：`http://localhost:3000`

预期：出现粘贴文章界面；窗口窄于 900px 时批注栏移到阅读文章之后；Tab 键可看见清晰焦点。

### Task 6: 接通阅读、选区翻译与单词本交互

**Files:**
- Create: `public/js/api.js`
- Create: `public/js/app.js`
- Modify: `public/index.html`

- [ ] **Step 1: 实现浏览器 API 封装**

在 `public/js/api.js` 导出：

```js
export async function requestTranslation(payload) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '翻译暂时不可用，请稍后重试。');
  return body;
}
```

- [ ] **Step 2: 实现文章渲染与单词查询**

在 `public/js/app.js` 导入 `splitParagraphs`、`tokenizeParagraph`、`classifySelection`、`addOrUpdateWord`、`createMarkdown` 与 `requestTranslation`。点击“开始精读”时，将文章存到 `localStorage` 的 `cet6:article`，逐段渲染：英文 token 为 `<button class="word-token">`；其它 token 作为文本节点；每段末尾有“翻译本段”按钮。点击单词请求 `{ scope: 'word', text: word, context: paragraph }`，在批注区按词性显示义项，并按 `最高频 → 常见 → 较少见` 进行排序。

- [ ] **Step 3: 实现选区与段落翻译**

监听 `mouseup` 与键盘选择结束事件。当 `window.getSelection().toString().trim()` 非空时，将选中范围的文字通过 `classifySelection` 分为短语/句子并显示 `#selection-actions`；点击翻译发送 `{ scope, text }`。段落按钮发送 `{ scope: 'paragraph', text: paragraph }`。所有翻译状态先显示“正在翻译…”，失败时展示返回的中文错误，成功时显示原文与译文。

- [ ] **Step 4: 实现收藏、本地恢复和导出**

在单词查询结果中提供“加入单词本”按钮：将当前词的语境释义、首个对应词性、所在段落和 ISO 日期传给 `addOrUpdateWord`，并保存到 `localStorage` 的 `cet6:wordbook`。页面加载时恢复文章和单词本。点击“导出 Markdown”时用 `createMarkdown(entries, new Date().toISOString().slice(0, 10))` 创建 `Blob`，以 `cet6-wordbook.md` 触发浏览器下载。每个单词本条目提供删除按钮。

- [ ] **Step 5: 端到端人工验收**

运行：`npm start`

在浏览器完成：粘贴两段英文 → 点一个多义词 → 检查词性分组与常见度标签 → 收藏 → 刷新页面 → 拖选短语并翻译 → 翻译一整段 → 导出单词本。

预期：所有翻译只通过本机 `/api/translate` 请求；收藏刷新后仍在；导出的 Markdown 有标题、词义和原句。

### Task 7: 接入真实密钥并进行安全收尾

**Files:**
- Create: `.env`（仅使用者本机，禁止提交）
- Modify: `README.md`

- [ ] **Step 1: 写最小运行说明**

创建 `README.md`，说明：复制 `.env.example` 为 `.env`，填入自己的 `DEEPSEEK_API_KEY`；运行 `npm install` 后执行 `npm start`；在浏览器打开 `http://localhost:3000`；永远不要把 `.env` 或 API Key 发给任何人。

- [ ] **Step 2: 本机填写密钥**

使用者在本机创建 `.env`，按如下格式填写真实 Key：

```env
DEEPSEEK_API_KEY=sk-你的真实密钥
PORT=3000
```

- [ ] **Step 3: 验证真实调用与密钥不泄露**

运行：`npm start`

打开页面并点击一个英文单词。

预期：批注面板显示结构化词义；浏览器开发者工具的请求地址仅为 `http://localhost:3000/api/translate`，页面源代码和网络请求体中不出现 `sk-` 开头的 API Key。

- [ ] **Step 4: 运行最终自动化测试**

运行：`npm test`

预期：测试进程以状态码 0 结束，且没有失败测试。

## 自查结果

- 规格中的粘贴文章、逐词查询、短语/句子/段落翻译、AI 常见度排序、本地单词本、Markdown 导出、安全密钥处理和错误提示都在 Task 1–7 中有对应实现与验证步骤。
- 已检查计划中没有 `TBD`、`TODO` 或模糊的“后续实现”占位。
- 文本模块、单词本模块、提示词模块、DeepSeek 客户端、HTTP 路由和界面职责分离；函数命名在调用位置与定义位置一致。
