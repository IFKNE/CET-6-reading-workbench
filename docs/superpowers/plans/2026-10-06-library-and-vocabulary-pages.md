# 独立书架与单词本页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文章库和单词本拆为独立视图，并支持文章重命名、分类编辑、词汇搜索和来源筛选。

**Architecture:** 保持单页应用但通过 `state.view` 控制三个顶级视图；IndexedDB 文章记录以纯函数更新元数据；单词本的搜索与筛选提取为纯函数，UI 只渲染结果。

**Tech Stack:** Vanilla JavaScript、IndexedDB、CSS、node:test。

---

### Task 1: 文章更新与单词筛选纯函数

**Files:**
- Modify: `public/js/article-model.js`
- Modify: `public/js/wordbook.js`
- Modify: `test/article-model.test.js`
- Modify: `test/wordbook.test.js`

- [ ] **Step 1: 写失败测试**

```js
assert.equal(updateArticleMetadata(record, { title: '新标题', category: '听力原文' }).title, '新标题');
assert.deepEqual(filterWords(entries, { query: 'critical', sourceId: '' }).map((x) => x.word), ['critical']);
```

- [ ] **Step 2: 运行测试确认失败，随后实现并复测**

`updateArticleMetadata` 返回保留正文的新版记录和新 `updatedAt`；`filterWords` 同时匹配词形、释义、来源标题并按来源 ID 筛选。

### Task 2: 三个独立页面结构与导航

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: 新增 `#library-view` 和 `#wordbook-view`**

文章库视图包含分类分区容器；单词本包含搜索、来源筛选和导出按钮。移除右侧单词本抽屉和遮罩。

- [ ] **Step 2: 实现 `switchView(view)`**

三个导航按钮设置当前视图；打开已保存文章时切回 `reader`；文章书架和单词本不会重置 `state.article`。

- [ ] **Step 3: 添加书架行内编辑**

每张卡有标题输入、分类选择和保存按钮；保存调用 `updateArticleMetadata` 与 `saveArticle`，再重新渲染书架。

- [ ] **Step 4: 添加单词筛选渲染**

从全局词条生成去重来源列表；输入搜索或改变来源筛选时用 `filterWords` 重绘卡片。导出继续使用当前完整词条集，不受筛选影响。

### Task 3: 精读页文末重点词与视觉收口

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

- [ ] **Step 1: 将 `#key-vocabulary` 放到阅读布局后的附录区域**

确保重点词位于书页正文/批注后、全文页面底部。

- [ ] **Step 2: 强化导航和书架视觉**

使用显式按钮背景、激活状态、卡片操作区、分区标题和响应式网格，令顶部按钮在截图比例下仍一眼可辨。

### Task 4: 验证

**Files:**
- Modify: `test/e2e.py`

- [ ] **Step 1: 更新页面结构断言**

验证 `#library-view`、`#wordbook-view`、`#word-search`、`#word-source-filter` 存在。

- [ ] **Step 2: 运行 `npm test` 与 JS 语法检查**

Expected: 所有单元测试通过，且 `app.js`、`article-model.js`、`wordbook.js` 无语法错误。
