# 本地精读文章库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供可分类、可重开的本地精读文章库，并将单词本关联至文章来源和出现次数，支持 DOCX 导出。

**Architecture:** 浏览器使用 IndexedDB 保存完整文章记录，`article-model.js` 保持可在 Node 中测试的纯数据转换。当前页面继续负责阅读交互；保存和重开仅通过文章库模块协调。Node 端添加一个仅本机使用的 DOCX 导出接口，使用 `docx` 生成下载内容。

**Tech Stack:** Vanilla JavaScript、IndexedDB、Express、Node `docx`、node:test、supertest。

---

### Task 1: 文章与词源纯数据模型

**Files:**
- Create: `public/js/article-model.js`
- Modify: `public/js/wordbook.js`
- Test: `test/article-model.test.js`
- Test: `test/wordbook.test.js`

- [ ] **Step 1: 为文章记录和同篇词频写失败测试**

```js
import { createArticleRecord, countWordInArticle } from '../public/js/article-model.js';

test('文章记录保存标题、分类、译文、高亮和重点词', () => {
  const record = createArticleRecord({
    article: 'Critical reading improves judgment.',
    category: '短篇阅读',
    prestudy: { title: '批判性阅读', translation: ['批判性阅读能提升判断力。'], vocabulary: {} },
    highlights: ['critical']
  });
  assert.equal(record.title, '批判性阅读');
  assert.equal(record.category, '短篇阅读');
  assert.deepEqual(record.highlights, ['critical']);
});

test('词频忽略大小写并按完整单词计算', () => {
  assert.equal(countWordInArticle('Critical thinking is critically important.', 'critical'), 1);
});
```

为 `addOrUpdateWord` 增加断言：同一单词合并 `sources.article-1.count`，保留其他文章来源。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: `article-model.js` 尚不存在，测试失败。

- [ ] **Step 3: 实现纯模型与词源合并**

```js
export function createArticleRecord({ id, article, category, prestudy, highlights, createdAt }) {
  const now = new Date().toISOString();
  return {
    id: id ?? crypto.randomUUID(), article, category: category || '短篇阅读',
    title: prestudy?.title || '未命名精读文章',
    translation: prestudy?.translation ?? [], vocabulary: prestudy?.vocabulary ?? {},
    highlights: [...new Set(highlights ?? [])], createdAt: createdAt ?? now, updatedAt: now
  };
}
```

实现 `countWordInArticle`，使用转义后的 `\\b` 正则统计完整单词；扩展 `addOrUpdateWord(entries, entry)`，按小写词形合并旧条目，使用 `entry.source` 的文章 ID 更新该来源的 `count`、标题和最近记录时间。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: 所有测试通过。

### Task 2: IndexedDB 文章库封装

**Files:**
- Create: `public/js/article-library.js`
- Modify: `public/js/article-model.js`
- Test: `test/article-model.test.js`

- [ ] **Step 1: 添加文章重开数据转换的失败测试**

```js
import { restoreArticleState } from '../public/js/article-model.js';

test('已保存文章可转换为精读页面状态', () => {
  const restored = restoreArticleState({ id: 'a1', article: 'Text', title: '标题', category: '听力原文', translation: ['译文'], vocabulary: { text: {} }, highlights: ['text'] });
  assert.equal(restored.articleId, 'a1');
  assert.equal(restored.prestudy.translation[0], '译文');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: `restoreArticleState` 未导出。

- [ ] **Step 3: 实现模型转换与 IndexedDB CRUD**

在 `article-model.js` 实现 `restoreArticleState(record)`。在 `article-library.js` 使用数据库 `cet6-reading-library`、对象仓 `articles`（keyPath `id`）实现：

```js
export async function listArticles();
export async function getArticle(id);
export async function saveArticle(record);
export async function deleteArticle(id);
```

`listArticles` 按 `updatedAt` 倒序；每个 API 将 IndexedDB 不可用或事务失败转换为可读错误。

- [ ] **Step 4: 运行测试确认通过并手动确认数据库**

Run: `npm test`

Expected: 所有 Node 测试通过。

Manual: 浏览器控制台调用 `saveArticle` 后刷新并以 `listArticles` 读取同一记录。

### Task 3: 六级预研读标题与提示词

**Files:**
- Modify: `server/prompts.js`
- Test: `test/prompts.test.js`
- Test: `test/deepseek.test.js`

- [ ] **Step 1: 添加预研读标题和六级要求的失败测试**

```js
const messages = buildMessages({ scope: 'prestudy', text: 'A sample text.' });
assert.match(messages[0].content, /"title"/);
assert.match(messages[0].content, /大学英语六级/);
assert.match(messages[0].content, /常考搭配/);
```

并让 DeepSeek 客户端 mock 返回含 `title` 的预研读 JSON，断言它仍作为 `{ kind: 'prestudy', data }` 返回。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: 提示词不含标题字段或六级搭配规则。

- [ ] **Step 3: 更新提示词 JSON 契约**

在 `prestudy` JSON 顶层加入 `title`，要求 8–18 字中文标题；对所有 system prompt 追加六级阅读背景、常见考法、搭配与语境义要求，不改变 API scope 或响应路径。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: 所有测试通过。

### Task 4: DOCX 导出接口

**Files:**
- Modify: `package.json`
- Create: `server/docx-export.js`
- Modify: `server/app.js`
- Test: `test/docx-export.test.js`
- Test: `test/deepseek.test.js`

- [ ] **Step 1: 安装依赖并先写失败测试**

Run: `npm install docx`

测试 `createWordbookDocument(entries)` 对一条带 `sources`、`phrases`、`example` 的词条返回非空 Buffer；使用 Supertest POST `/api/wordbook.docx` 后断言状态 200、`Content-Type` 包含 Office 文档 MIME 类型和附件文件名。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: 导出模块和路由尚不存在。

- [ ] **Step 3: 实现 DOCX 构建和下载路由**

`server/docx-export.js` 使用 `docx` 的 `Document`、`Paragraph` 和 `Packer.toBuffer` 创建“六级精读单词本”。每个词写入：词名、词性与释义、短语、例句、原句、来源文章名与次数。

在 `server/app.js` 加入：

```js
app.post('/api/wordbook.docx', async (req, res, next) => {
  const buffer = await createWordbookDocument(req.body.entries);
  res.attachment('cet6-wordbook.docx');
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buffer);
});
```

拒绝非数组 `entries`，返回 400；不记录或持久化上传内容。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: 所有测试通过。

### Task 5: 文章库与精读界面整合

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/js/app.js`
- Modify: `public/js/article-cache.js`

- [ ] **Step 1: 在输入页加入分类与文章库容器**

新增默认分类选择/自定义分类输入、`#save-article`、`#open-library`，以及文章库抽屉。卡片包含分类、标题、更新时间和重点词数；无记录时显示空状态。

- [ ] **Step 2: 在精读页加入保存与重点词区**

在工具栏新增“保存精读”按钮；文章正文下新增 `#key-vocabulary`。使用 `state.prestudy.vocabulary` 生成最多 24 个词卡，点击词卡调用已有 `renderWordAnnotation`。

- [ ] **Step 3: 连接状态与文章库 CRUD**

在 `app.js` 状态中加入 `articleId`、`category`。粘贴文章时取选定分类；预研读完成后更新标题。点击保存时以 `createArticleRecord` 建立或更新记录；高亮后若已有 `articleId` 则静默更新。

打开文章库卡片时调用 `getArticle` 和 `restoreArticleState`，恢复文章、预研读、分类、高亮和读者页面，且不调用 `prepareArticleStudy`。

- [ ] **Step 4: 连接词源统计和 DOCX 下载**

收藏词时传入当前保存文章作为 `source`；使用 `countWordInArticle` 计算该词完整单词次数。单词本渲染每条词的来源数、总次数和来源文章列表。新增 `exportWordbookDocx`，POST 当前 `state.entries`，将返回 Blob 下载为 `cet6-wordbook.docx`。

- [ ] **Step 5: 手动浏览器验收**

1. 粘贴文章，选择“听力原文”，等待预研读，确认自动标题和重点词出现。
2. 保存后在文章库中看到分类和标题；刷新并重新打开，确认高亮、全文译文和重点词恢复，且不重新请求 AI。
3. 收藏一个出现两次的词，确认词条显示来源文章及次数 2。
4. 点击 DOCX 导出，确认下载文件名为 `cet6-wordbook.docx`。

### Task 6: 最终回归验证

**Files:**
- Modify: `test/e2e.py`

- [ ] **Step 1: 更新浏览器脚本的 UI 断言**

让 e2e 脚本验证分类控件、重点词容器、文章库入口、词源文案和 DOCX 下载按钮的存在；不依赖真实 DeepSeek 返回。

- [ ] **Step 2: 运行完整测试与浏览器验收**

Run: `npm test`

Expected: 所有单元与 API 测试通过。

Run: `python test/e2e.py`

Expected: 本地页面交互通过并输出截图。

