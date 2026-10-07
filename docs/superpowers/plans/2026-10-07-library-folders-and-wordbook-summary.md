# 精读书架与单词摘要 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让精读文章可归入本地文件夹，并让单词本外层保持简洁、详细档案按需生成。

**Architecture:** IndexedDB 保留文章并新增文件夹对象仓；文章记录只保存文件夹 ID。单词卡片复用预研读缓存中的常用释义、短语和一个句子，详细信息仅在用户操作时请求并写回本地单词本。

**Tech Stack:** 原生 ES modules、IndexedDB、Node test、DeepSeek API。

---

### Task 1: 修复单词本外层原文

**Files:**
- Modify: `test/wordbook.test.js`
- Modify: `public/js/wordbook.js`

- [x] **Step 1: 写出失败的句子提取测试**，给定三句原文时仅选择含目标词的句子。
- [x] **Step 2: 运行 `npm test`**，确认因缺少导出函数失败。
- [x] **Step 3: 实现 `getWordContextSentence`**，用完整词边界选取第一句命中句。
- [x] **Step 4: 运行 `npm test`**，确认测试转绿。

### Task 2: 让词条档案包含外层需要的数据

**Files:**
- Modify: `server/prompts.js`
- Modify: `public/js/app.js`

- [x] **Step 1: 用现有 word prompt 单元测试作为保护**，保持 CET-6 JSON 输出约束。
- [x] **Step 2: 在单词查询结构中加入 `phrases` 与 `example`**，使用户主动生成详细档案后也能补齐摘要。
- [x] **Step 3: 保持卡片外层仅为词性/常用义/短语/一句原文**，详细区保留“生成详细档案”按钮。
- [x] **Step 4: 运行 `npm test`**。

### Task 3: 在文章模型中保存文件夹归属

**Files:**
- Modify: `test/article-model.test.js`
- Modify: `public/js/article-model.js`

- [x] **Step 1: 写失败测试**：创建文章与恢复文章均保留 `folderId`。
- [x] **Step 2: 运行 `npm test -- test/article-model.test.js`**，确认字段不存在导致失败。
- [x] **Step 3: 为文章记录、恢复状态和元数据更新加入 `folderId`**。
- [x] **Step 4: 再次运行该测试，确认通过。**

### Task 4: 建立文件夹书架交互

**Files:**
- Modify: `public/js/article-library.js`
- Modify: `public/index.html`
- Modify: `public/js/app.js`
- Modify: `public/styles.css`

- [x] **Step 1: IndexedDB 升级至版本 2，新增 `folders` 对象仓和增删列举 API。**
- [x] **Step 2: 新文章保存时选定文件夹；书架中可创建、筛选和删除文件夹。**
- [x] **Step 3: 卡片编辑中可重命名、改分类、移入文件夹或删除文章。删除文件夹时文章转为未归档。**
- [x] **Step 4: 每次进入“我的精读”均重新读取 IndexedDB 并渲染。**
- [x] **Step 5: 运行完整测试与本地 HTTP 冒烟检查。**
