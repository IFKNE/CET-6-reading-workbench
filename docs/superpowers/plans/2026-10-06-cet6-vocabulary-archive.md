# 六级词汇档案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提供可展开的六级词汇档案、掌握状态与价值筛选。

**Architecture:** 扩展单词 API JSON 和现有本地词条对象；`wordbook.js` 负责状态筛选，`app.js` 负责档案展开、补全和持久化。

**Tech Stack:** Vanilla JavaScript、DeepSeek API、node:test。

---

### Task 1: 词汇档案数据与提示词

**Files:** `test/wordbook.test.js`, `test/prompts.test.js`, `public/js/wordbook.js`, `server/prompts.js`

- [ ] 写失败测试：`filterWords(entries, { status: 'fuzzy' })` 只返回模糊词；单词提示词包含 `wordFormation`、`confusables`、`importanceTags`。
- [ ] 实现状态过滤和 CET-6 JSON 扩展。
- [ ] 运行 `npm test`。

### Task 2: 单词本档案界面

**Files:** `public/index.html`, `public/js/app.js`, `public/styles.css`

- [ ] 增加掌握度/价值快捷筛选。
- [ ] 为词条加入摘要、展开档案、状态按钮与补全档案按钮。
- [ ] 补全时调用既有 word API 并合并回本地词条。

### Task 3: 验证

**Files:** `test/e2e.py`

- [ ] 断言快捷筛选和词汇档案区域存在。
- [ ] 运行 `npm test`、`node --check public/js/app.js` 和 localhost 页面检查。
