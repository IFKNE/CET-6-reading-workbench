# 单词预热队列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户点词前分批缓存常用释义，使精读页面优先从本地数据展示结果。

**Architecture:** `article-cache.js` 只负责确定候选和分批；服务端新增 `word-batch` scope，DeepSeek 返回轻量词条；`app.js` 以单并发队列把批次合并进现有预研读缓存，并在点击时优先缓存。

**Tech Stack:** ES modules、Express、DeepSeek、Node test。

---

### Task 1: 候选词分批

**Files:**
- Modify: `test/article-cache.test.js`
- Modify: `public/js/article-cache.js`

- [ ] **Step 1: 写失败测试**：首段候选在前、缓存词不重复、每批最多 8 个。
- [ ] **Step 2: 运行测试并确认失败。**
- [ ] **Step 3: 实现 `createWarmupBatches(article, vocabulary)`。**
- [ ] **Step 4: 运行测试确认通过。**

### Task 2: 批量翻译接口

**Files:**
- Modify: `test/deepseek.test.js`
- Modify: `server/prompts.js`
- Modify: `server/deepseek.js`
- Modify: `server/app.js`

- [ ] **Step 1: 写失败测试**：`word-batch` API 返回解析后的词条数组。
- [ ] **Step 2: 实现 scope 验证、提示词与 JSON 解析。**
- [ ] **Step 3: 运行接口测试。**

### Task 3: 浏览器优先队列

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: 预研读完成后启动一次单并发预热队列。**
- [ ] **Step 2: 每批完成即写入 localStorage；文章切换时丢弃旧队列。**
- [ ] **Step 3: 点击命中缓存立即展示，未命中保持原单词查询兜底。**
- [ ] **Step 4: 运行完整测试、语法检查与 localhost 冒烟检查。**
