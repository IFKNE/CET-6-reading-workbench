# 阅读书房视觉改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为精读工具提供持久暗色模式、清晰导航和书页式文章阅读界面。

**Architecture:** 新增独立的 `theme.js` 管理主题状态和 `localStorage` 持久化；HTML 为导航与阅读元信息提供语义锚点；CSS 通过主题变量覆盖所有模块颜色与布局。

**Tech Stack:** Vanilla JavaScript、CSS 自定义变量、node:test。

---

### Task 1: 主题状态模块

**Files:**
- Create: `public/js/theme.js`
- Create: `test/theme.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { nextTheme, readTheme } from '../public/js/theme.js';
assert.equal(nextTheme('light'), 'dark');
assert.equal(nextTheme('dark'), 'light');
assert.equal(readTheme('unknown'), 'light');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: `theme.js` 不存在。

- [ ] **Step 3: 实现纯主题函数**

导出 `readTheme(value)`，只接受 `light`/`dark`；导出 `nextTheme(current)` 返回另一有效主题。浏览器入口使用这些函数设置 `document.documentElement.dataset.theme` 并保存 `cet6:theme`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: 所有测试通过。

### Task 2: 导航和书页阅读结构

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: 增加页面语义锚点**

给粘贴区、文章库和阅读区加入 `id`；顶部加入开始精读、我的精读、单词本和 `#theme-toggle`。阅读区增加文章标题、分类书签、阅读进度以及书页页脚。

- [ ] **Step 2: 连接主题和阅读元信息**

在 `app.js` 导入主题模块，初始化、切换并更新按钮 `aria-label`。文章标题使用预研读标题，分类取 `state.category`，段落总数由 `splitParagraphs(state.article)` 计算；每次打开或恢复文章调用元信息渲染。

### Task 3: 主题变量与响应式视觉系统

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: 定义浅色与暗色 token**

保留现有浅色 token；用 `html[data-theme="dark"]` 覆盖背景、纸张、墨色、线条、卡片和阴影变量。禁止纯黑背景和高亮白正文。

- [ ] **Step 2: 实现书页和模块样式**

为导航做胶囊式模块入口；正文书页增加书脊渐变、页眉、页脚、内页阴影和较稳定的行宽；批注卡设为独立便签。文章书架和重点词采用低干扰卡片。

- [ ] **Step 3: 补充移动端规则**

在 900px 以下隐藏次级导航文字或换行，阅读布局改单栏；在 560px 以下缩小书页内边距、工具栏和顶部模块，保证按钮仍可点击。

### Task 4: 回归验证

**Files:**
- Modify: `test/e2e.py`

- [ ] **Step 1: 更新 UI 断言**

确认 `#theme-toggle`、`#reading-book-title`、`#reading-progress`、`.book-page-footer` 存在。

- [ ] **Step 2: 运行验证**

Run: `npm test`

Expected: 所有自动测试通过。

Run: `node --check public/js/app.js && node --check public/js/theme.js`

Expected: 无语法输出。

