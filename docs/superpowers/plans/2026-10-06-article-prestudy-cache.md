# 文章预研读缓存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首次打开文章时预缓存全文译文与 DeepSeek 挑选的重点词，使缓存命中时的点词和全文翻译即时显示。

**Architecture:** `server/prompts.js` 与 `server/deepseek.js` 新增一次性 `prestudy` 结构化任务；浏览器用独立 `article-cache.js` 为规范化文章建立稳定键、管理 localStorage 缓存和单词补充。`app.js` 先读取缓存，未命中则后台请求预研读；点击词条优先渲染预研读数据。

**Tech Stack:** Node.js、Express、原生 ES 模块、Node 内置 `node:test`、DeepSeek Chat Completions API、浏览器 localStorage。

---

### Task 1: 先用测试定义文章键与缓存合并

**Files:**
- Create: `public/js/article-cache.js`
- Create: `test/article-cache.test.js`

- [ ] **Step 1: 写失败的缓存测试**

在 `test/article-cache.test.js` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleKey, mergeVocabulary } from '../public/js/article-cache.js';

test('文章键忽略段首尾空白但区分不同正文', () => {
  assert.equal(createArticleKey('  Read well.  '), createArticleKey('Read well.'));
  assert.notEqual(createArticleKey('Read well.'), createArticleKey('Read deeply.'));
});

test('单词查询结果补充到预研读词表', () => {
  const cache = { vocabulary: { critical: { word: 'critical' } } };
  const result = mergeVocabulary(cache, { word: 'evidence', contextMeaning: '证据' });
  assert.equal(result.vocabulary.critical.word, 'critical');
  assert.equal(result.vocabulary.evidence.contextMeaning, '证据');
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test`

预期：因 `article-cache.js` 尚不存在而失败。

- [ ] **Step 3: 实现最小缓存模块**

在 `public/js/article-cache.js` 实现 `normalizeArticle(text)`（分段 trim 后以 `\n\n` 连接）、`createArticleKey(text)`（FNV-1a 32 位十六进制哈希，前缀 `v1:`）和 `mergeVocabulary(cache, entry)`（按小写 word 返回不变数据的新对象）。

- [ ] **Step 4: 运行缓存测试**

运行：`npm test`

预期：新测试与已有测试全部通过。

### Task 2: 先测试 DeepSeek 预研读接口

**Files:**
- Modify: `test/prompts.test.js`
- Modify: `test/deepseek.test.js`
- Modify: `server/prompts.js`
- Modify: `server/deepseek.js`
- Modify: `server/app.js`

- [ ] **Step 1: 写失败测试**

在 `test/prompts.test.js` 添加：

```js
test('预研读要求全文译文、重点词、短语和例句 JSON', () => {
  const messages = buildMessages({ scope: 'prestudy', text: 'Critical reading improves judgment.' });
  assert.match(messages[0].content, /全文译文/);
  assert.match(messages[0].content, /phrases/);
  assert.match(messages[0].content, /example/);
});
```

在 `test/deepseek.test.js` 添加：

```js
test('预研读结果解析为缓存数据', async () => {
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"translation":["批判性阅读能改善判断力。"],"vocabulary":[]}' } }] }), { status: 200 }) });
  const result = await client.translate({ scope: 'prestudy', text: 'Critical reading improves judgment.' });
  assert.equal(result.kind, 'prestudy');
  assert.equal(result.data.translation[0], '批判性阅读能改善判断力。');
});
```

并把路由测试中的 `scope: 'prestudy'` 期望为 200。

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test`

预期：预研读提示词、客户端解析和路由范围测试失败。

- [ ] **Step 3: 实现预研读服务**

在 `server/prompts.js` 新增 `prestudy` system 提示词：要求只返回 JSON，`translation` 为与原文段落数一致的中文数组，`vocabulary` 为 12–24 个 CET-6 重点词；每个词含现有单词字段，以及 `phrases`（最多三项）和 `example`（英文、中文）。在 `server/deepseek.js` 清除代码围栏、解析 JSON 并返回 `{ kind: 'prestudy', data }`。在 `server/app.js` 增加 `prestudy` 为合法 scope，且不截断其正文。

- [ ] **Step 4: 运行服务测试**

运行：`npm test`

预期：预研读、已有翻译、问答和缓存测试全部通过。

### Task 3: 接入缓存优先的阅读界面

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/js/app.js`

- [ ] **Step 1: 添加全文译文入口**

在 `#reader-view` 工具栏添加 `#show-article-translation` 按钮，初始文字为“全文译文”；在缓存尚未完成时禁用，完成后启用。

- [ ] **Step 2: 读取和建立预研读缓存**

在 `app.js` 导入 `createArticleKey`、`mergeVocabulary`。增加 `cet6:prestudy-cache` localStorage 对象，按文章键读取缓存；打开文章时先命中并更新状态栏，否则后台调用 `requestTranslation({ scope: 'prestudy', text: state.article })`。把词条数组索引成小写词键，存入 `{ articleKey, translation, vocabulary, createdAt }` 并保留最多 12 篇最新文章缓存。

- [ ] **Step 3: 让点词、右键动作优先使用缓存**

修改 `lookupWord`：先查 `state.prestudy.vocabulary[normalizeWord(word)]`，命中时直接渲染并保存，无 API 请求；未命中才调用已有单词接口，并用 `mergeVocabulary` 写回当前文章缓存。右键翻译与加入单词本继续复用 `lookupWord`。

- [ ] **Step 4: 展示短语、例句与全文译文**

在词卡 `renderWordAnnotation` 中渲染 `phrases` 和 `example`；全文按钮点击后在批注栏按段展示缓存的中文译文。补充 `.phrase-list`、`.article-translation` 与禁用按钮的纸质批注风格。

- [ ] **Step 5: 人工验收**

运行：`npm start`。首次粘贴文章后观察“正在预研读”再变为“已缓存”；点预研读词立即显示义项、短语和例句；打开全文译文；刷新并重开同文，确认显示“已使用本地预研读”且不发新预研读请求；点击未覆盖单词，确认其后续点击即时显示。

## 自查结果

- 规格中的全文译文、重点筛词、短语、例句、本地缓存、缓存未命中补充和故障降级均在任务 1–3 中有对应实现与验证。
- 计划中没有待定项；所有新增服务接口与纯函数在实现前均有失败测试。
- 当前目录不是 Git 仓库，不执行提交操作。
