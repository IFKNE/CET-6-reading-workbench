# 阅读右键菜单与全文问答 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为可点击单词新增本地持久化高亮的右键菜单，并提供基于整篇文章上下文的 DeepSeek 问答入口。

**Architecture:** 浏览器使用 `contextmenu` 事件在单词旁渲染自定义菜单；高亮词形保存在 `cet6:highlights`。全文提问走现有本机 `/api/translate`，新增 `question` scope；服务端把整篇文章作为上下文并返回自然中文回答。

**Tech Stack:** Node.js、Express、原生 ES 模块、Node 内置 `node:test`、DeepSeek Chat Completions API。

---

### Task 1: 先测试全文问答提示词和 API 范围

**Files:**
- Modify: `test/prompts.test.js`
- Modify: `test/deepseek.test.js`
- Modify: `server/prompts.js`
- Modify: `server/app.js`

- [ ] **Step 1: 添加失败测试**

在 `test/prompts.test.js` 添加：

```js
test('全文问答携带文章与问题，并要求结合全文回答', () => {
  const messages = buildMessages({ scope: 'question', text: '作者的核心观点是什么？', context: 'Reading critically improves judgment.' });
  assert.match(messages[0].content, /结合全文/);
  assert.match(messages[1].content, /文章全文：Reading critically/);
  assert.match(messages[1].content, /问题：作者的核心观点是什么？/);
});
```

在 `test/deepseek.test.js` 的路由测试后添加：

```js
test('全文问答 scope 可通过本机 API', async () => {
  const app = createApp({ translator: { translate: async (input) => ({ kind: 'answer', answer: input.text }) } });
  const response = await request(app).post('/api/translate').send({ scope: 'question', text: '作者观点？', context: '文章全文' });
  assert.equal(response.status, 200);
  assert.equal(response.body.kind, 'answer');
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test`

预期：全文问答提示词断言失败，且 `question` 被 API 拒绝为 400。

- [ ] **Step 3: 实现最小问答服务**

在 `server/prompts.js` 为 `question` 返回 system 内容“结合全文，以清晰、简洁的中文回答学习者问题；如果文章没有依据，明确说明”，user 内容为 `文章全文：${context}\n\n问题：${text}`。在 `server/app.js` 的 `validScopes` 增加 `question`，并允许其 context 最长 10000 字符。`server/deepseek.js` 对 `question` 返回 `{ kind: 'answer', answer: content.trim() }`。

- [ ] **Step 4: 运行测试确认通过**

运行：`npm test`

预期：全文问答测试和已有测试全部通过。

### Task 2: 右键菜单、高亮与全文提问界面

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/js/app.js`

- [ ] **Step 1: 创建右键菜单与提问框 HTML**

在 `public/index.html` 的 `</main>` 前加入：

```html
<div id="word-context-menu" class="word-context-menu" hidden role="menu">
  <p id="context-menu-word"></p>
  <button type="button" data-action="highlight">高亮</button>
  <button type="button" data-action="translate">翻译</button>
  <button type="button" data-action="save">加入单词本</button>
  <button type="button" data-action="question">问 AI</button>
</div>
<section id="question-modal" class="question-modal" hidden aria-label="基于全文问 AI">
  <form id="article-question-form">
    <button id="close-question" type="button" aria-label="关闭提问框">×</button>
    <p class="eyebrow">ASK THE WHOLE ARTICLE</p>
    <h2>基于全文，问 AI</h2>
    <textarea id="article-question" rows="4" placeholder="例如：作者第二段如何支持自己的观点？"></textarea>
    <button class="primary-button" type="submit">提问 <span>→</span></button>
  </form>
</section>
```

- [ ] **Step 2: 实现菜单与高亮状态**

在 `app.js` 增加 `cet6:highlights` 的读取、写入和 `isHighlighted(word)`；右键单词时阻止浏览器默认菜单、记录 `{ word, context }`、定位并显示 `#word-context-menu`。点击“高亮”切换该词小写形式的高亮状态，重新渲染文章。文章渲染时给已高亮单词附加 `is-highlighted` 类；点击页面空白处或按 Escape 时关闭菜单。

- [ ] **Step 3: 实现翻译、收藏与全文问答动作**

“翻译”调用已有 `lookupWord`；“加入单词本”先查询后在同一结果上调用 `saveWord`；“问 AI”打开模态框。表单提交时调用 `requestTranslation({ scope: 'question', text: question, context: state.article })`，在右侧批注栏显示 `全文问答`、问题和 `result.answer`。

- [ ] **Step 4: 实现菜单与提问框样式**

在 `styles.css` 添加 `.word-context-menu` 的固定定位暖纸卡片样式、菜单按钮悬停荧光笔样式、`.word-token.is-highlighted` 的永久荧光笔底纹、`.question-modal` 的全屏半透明遮罩和居中纸张表单样式。

- [ ] **Step 5: 人工验收**

运行：`npm start`

在浏览器：粘贴文章 → 右键单词 → 高亮 → 刷新页面检查高亮仍在 → 右键同一词并翻译/加入单词本 → 打开“问 AI”并提问“作者的核心观点是什么？”。

预期：四项右键动作均可用；高亮本地保存；问答结果结合全文且显示在批注栏。

## 自查结果

- 右键菜单、四项动作、持久化高亮和全文上下文问答均有明确任务。
- API 新范围有自动化测试；浏览器交互有完整人工验收步骤。
- 当前目录不是 Git 仓库，实施过程不包含提交操作。
