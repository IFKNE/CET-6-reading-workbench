# 单词详情入口与单词本来源筛选实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先让原文精读页点词后能进入与单词本相同的整页详情（返回关系符合来源、加入有动画与已收录标识），再把单词本的来源筛选改成文件夹式多层多选。

**Architecture:** 纯逻辑（返回目标解析、已收录判定、来源树与选择模型）全部抽进无 DOM 的小模块，`public/js/app.js` 只做渲染与事件接线；沿用仓库现有模式（`text.js` / `prestudy.js` / `theme.js` 都是这种小纯模块）。DOM 行为由 `test/e2e.py` 与手工清单验证。

**Tech Stack:** 原生 ES modules、Node 内置 `node:test`、Express 静态服务、IndexedDB（精读库）、localStorage（单词本）。

**设计文档：**
- `docs/superpowers/specs/2026-10-09-word-detail-navigation-and-saved-state-design.md`
- `docs/superpowers/specs/2026-10-09-wordbook-source-browser-design.md`

---

## 环境说明（每个任务都适用）

- 本机（DSH 沙箱外）：`npm test`。
- **在 DSH 沙箱内**：`npm test`（= `node --test`）会为每个测试文件派生子进程并以 `spawn EPERM` 失败，必须逐文件运行：`node test/wordbook.test.js`。本计划的所有命令都写成这种形式。
- `test/e2e.py` 需要 Playwright（本机未安装：`python -c "import playwright"` 失败）。涉及它的任务标为「可选」，装好后用 `python test/e2e.py`（需先 `npm start` 让 3000 端口可用）。
- 浏览器验证：静态文件改动后要硬刷新（Ctrl+F5）；`server/` 改动由 `node --watch` 自动重启。

---

## 文件结构

**第一阶段（详情入口与返回关系）**

- Create: `public/js/view-nav.js` — 返回目标解析（`resolveViewBack`），无 DOM。
- Modify: `public/js/wordbook.js` — 新增 `isWordSaved` / `savedWordKeys`。
- Modify: `public/js/app.js` — 视图来源跟踪、滚动记忆、导航高亮、`openWordDetail`、面板已收录状态、重点词卡片标识、`refreshSavedWordUi`。
- Modify: `public/styles.css` — 加入按钮与卡片的已收录态与动画。
- Create: `test/view-nav.test.js`；Modify: `test/wordbook.test.js`、`test/e2e.py`（可选）。

**第二阶段（来源筛选多层多选）**

- Create: `public/js/word-sources.js` — 来源树、选择模型、命中过滤、文案描述，无 DOM。
- Create: `test/word-sources.test.js`。
- Modify: `public/js/wordbook.js` — `filterWords` 去掉 `sourceId`（来源筛选改由 `filterEntriesBySource` 负责）。
- Modify: `public/index.html` — `#word-source-filter` 换成触发按钮 + 面板容器。
- Modify: `public/js/app.js` — 精读库索引缓存（`state.libraryIndex`）、面板渲染与开合、触发按钮文案、`renderWordbook` 组合筛选。
- Modify: `public/styles.css` — 触发按钮、面板、层级行、三态勾选框、面包屑。
- Modify: `test/wordbook.test.js`、`test/e2e.py`（可选）。

---

# 第一阶段：单词详情入口与返回关系

## Task A1: 已收录判定（纯函数）

**Files:**
- Modify: `public/js/wordbook.js`
- Test: `test/wordbook.test.js`

- [ ] **Step 1: 写失败测试**

在 `test/wordbook.test.js` 顶部 import 里加入 `isWordSaved, savedWordKeys`：

```js
import { addOrUpdateWord, createMarkdown, createWordSummary, filterWords, getWordContextSentence, isWordSaved, savedWordKeys } from '../public/js/wordbook.js';
```

在文件末尾追加：

```js
test('按小写词形判断单词是否已收录', () => {
  const entries = [{ word: 'critical' }, { word: 'evidence' }];
  assert.equal(isWordSaved(entries, 'Critical'), true);
  assert.equal(isWordSaved(entries, 'critical'), true);
  assert.equal(isWordSaved(entries, 'judgment'), false);
  assert.equal(isWordSaved([], 'critical'), false);
  assert.equal(isWordSaved(null, 'critical'), false);
});

test('已收录词形集合可一次性标记重点词卡片', () => {
  const keys = savedWordKeys([{ word: 'Critical' }, { word: 'Evidence' }, { word: '' }, {}]);
  assert.equal(keys.has('critical'), true);
  assert.equal(keys.has('evidence'), true);
  assert.equal(keys.size, 2);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/wordbook.test.js`
Expected: FAIL —— `isWordSaved is not a function`（或 import 报未导出）。

- [ ] **Step 3: 实现**

在 `public/js/wordbook.js` 的 `addOrUpdateWord` 之后插入：

```js
export function savedWordKeys(entries) {
  const keys = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = String(entry?.word ?? '').trim().toLowerCase();
    if (key) keys.add(key);
  }
  return keys;
}

export function isWordSaved(entries, word) {
  const key = String(word ?? '').trim().toLowerCase();
  return Boolean(key) && savedWordKeys(entries).has(key);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/wordbook.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/wordbook.js test/wordbook.test.js
git commit -m "feat(wordbook): 增加已收录词形判定"
```

## Task A2: 返回目标解析（纯函数）

**Files:**
- Create: `public/js/view-nav.js`
- Test: `test/view-nav.test.js`

- [ ] **Step 1: 写失败测试**

创建 `test/view-nav.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewBack } from '../public/js/view-nav.js';

test('从原文进入的单词详情返回原文', () => {
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: 'reader', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
});

test('从单词本进入的单词详情返回单词本', () => {
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: 'wordbook', hasArticle: true }), { view: 'wordbook', label: '← 返回单词本' });
});

test('单词本返回来时的视图', () => {
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'reader', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'library', hasArticle: true }), { view: 'library', label: '← 返回我的精读' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'paste', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'word-detail', hasArticle: true }), { view: 'word-detail', label: '← 返回单词详情' });
});

test('没有来源记录时按是否有文章兜底', () => {
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: '', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: '', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: '', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/view-nav.test.js`
Expected: FAIL —— 找不到模块 `../public/js/view-nav.js`。

- [ ] **Step 3: 实现**

创建 `public/js/view-nav.js`：

```js
// 视图之间的返回关系：详情页与单词本都要回到“来时的那个视图”。
const backTargets = {
  'word-detail': {
    reader: { view: 'reader', label: '← 返回原文' },
    wordbook: { view: 'wordbook', label: '← 返回单词本' }
  },
  wordbook: {
    reader: { view: 'reader', label: '← 返回原文' },
    paste: { view: 'paste', label: '← 返回文章输入' },
    library: { view: 'library', label: '← 返回我的精读' },
    'word-detail': { view: 'word-detail', label: '← 返回单词详情' }
  }
};

export function resolveViewBack({ view, origin = '', hasArticle = false } = {}) {
  const fallback = hasArticle
    ? { view: 'reader', label: '← 返回原文' }
    : { view: 'paste', label: '← 返回文章输入' };
  return backTargets[view]?.[origin] ?? fallback;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/view-nav.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/view-nav.js test/view-nav.test.js
git commit -m "feat(nav): 增加视图返回目标解析"
```

## Task A3: 视图来源跟踪、滚动记忆、导航高亮

**Files:**
- Modify: `public/js/app.js`（`state` 对象、`switchView`、`closeDrawer`）

- [ ] **Step 1: 补 state 字段**

在 `public/js/app.js` 的 `state` 对象里，`view: 'paste',` 之前插入：

```js
  viewOrigin: '',
  detailWord: '',
  detailOrigin: 'wordbook',
  annotation: null,
  scrollMemory: {},
```

- [ ] **Step 2: 重写 switchView**

把 `switchView` 整体替换为：

```js
function switchView(view) {
  const previousView = state.view;
  if (view !== previousView) {
    state.scrollMemory[previousView] = window.scrollY;
    // 详情页是叶子视图：返回时不覆盖“来时的来源”，
    // 否则 原文 → 单词本 → 详情 → 返回单词本 → × 会又跳回详情。
    if (previousView !== 'word-detail') state.viewOrigin = previousView;
  }
  state.view = view;
  elements.pasteView.hidden = view !== 'paste';
  elements.readerView.hidden = view !== 'reader';
  elements.libraryView.hidden = view !== 'library';
  elements.wordbookView.hidden = view !== 'wordbook';
  elements.wordDetailView.hidden = view !== 'word-detail';
  // 顶部导航高亮跟随来源分区：从原文进详情页时不高亮“单词本”。
  const highlightView = view === 'word-detail' ? (state.detailOrigin === 'wordbook' ? 'wordbook' : '') : view;
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === highlightView));
  if (view === 'library') renderArticleLibrary();
  if (view === 'wordbook') renderWordbook();
  if (view === 'word-detail') renderWordDetail();
  if (view !== previousView) {
    window.requestAnimationFrame(() => window.scrollTo(0, state.scrollMemory[view] ?? 0));
  }
}
```

- [ ] **Step 3: 单词本的 × 改用统一返回目标**

把 `closeDrawer` 替换为：

```js
function closeDrawer() {
  const target = resolveViewBack({ view: 'wordbook', origin: state.viewOrigin, hasArticle: Boolean(state.article) });
  switchView(target.view);
}
```

- [ ] **Step 4: 补 import**

在 `public/js/app.js` 第 7 行 `import { nextTheme, readTheme } from './theme.js';` 之后插入一行：

```js
import { resolveViewBack } from './view-nav.js';
```

- [ ] **Step 5: 语法与静态检查**

Run: `node --check public/js/app.js`
Expected: 无输出（退出码 0）。`node --check` 只解析模块，不会因 DOM 缺失报错。

- [ ] **Step 6: 提交**

```bash
git add public/js/app.js
git commit -m "feat(nav): 视图来源跟踪与滚动位置记忆"
```

## Task A4: 统一详情入口与详情页返回

**Files:**
- Modify: `public/js/app.js`（新增 `openWordDetail` / `leaveWordDetail`，改 `renderWordDetail`、单词本行点击）

- [ ] **Step 1: 新增入口函数**

在 `renderWordbook` 之前插入：

```js
function openWordDetail(word, origin) {
  state.detailWord = String(word ?? '').trim().toLowerCase();
  state.detailOrigin = origin === 'reader' ? 'reader' : 'wordbook';
  switchView('word-detail');
}

function leaveWordDetail(targetView) {
  const word = state.detailWord;
  state.detailWord = '';
  switchView(targetView);
  refreshSavedWordUi(word, { animate: false });
}
```

（`refreshSavedWordUi` 在 Task A6 实现；本步骤先落地时它还不存在，因此 A4 与 A6 必须连续完成后再运行页面。）

- [ ] **Step 2: 单词本列表行改用统一入口**

把 `renderWordbook` 里的这一行：

```js
    row.addEventListener('click', () => { state.detailWord = entry.word; switchView('word-detail'); });
```

替换为：

```js
    row.addEventListener('click', () => openWordDetail(entry.word, 'wordbook'));
```

- [ ] **Step 3: 详情页返回按钮与移除行为**

把 `renderWordDetail` 开头这两行：

```js
  const back = createElement('button', 'text-button back-button', '← 返回单词本');
  back.type = 'button'; back.addEventListener('click', () => switchView('wordbook'));
```

替换为：

```js
  const backTarget = resolveViewBack({ view: 'word-detail', origin: state.detailOrigin, hasArticle: Boolean(state.article) });
  const back = createElement('button', 'text-button back-button', backTarget.label);
  back.type = 'button'; back.addEventListener('click', () => leaveWordDetail(backTarget.view));
```

把移除按钮的处理：

```js
  remove.type = 'button'; remove.addEventListener('click', () => {
    state.entries = state.entries.filter((item) => item.word !== entry.word);
    localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
    state.detailWord = ''; switchView('wordbook');
  });
```

替换为：

```js
  const removeTarget = resolveViewBack({ view: 'word-detail', origin: state.detailOrigin, hasArticle: Boolean(state.article) });
  remove.type = 'button'; remove.addEventListener('click', () => {
    state.entries = state.entries.filter((item) => item.word !== entry.word);
    localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
    leaveWordDetail(removeTarget.view);
  });
```

- [ ] **Step 4: 语法检查**

Run: `node --check public/js/app.js`
Expected: 无输出。

## Task A5: 面板已收录状态与「查看完整详情 →」

**Files:**
- Modify: `public/js/app.js`（`setAnnotationContent` 助手、`renderWordAnnotation`、`lookupWord`、`saveWord`）

- [ ] **Step 1: 加面板写入助手，统一清空/保留批注上下文**

在 `resetAnnotation` 之前插入：

```js
function setAnnotationContent(content, annotation = null) {
  state.annotation = annotation;
  elements.annotationPanel.replaceChildren(...content);
}
```

把 `resetAnnotation` 的函数体改为使用它：

```js
function resetAnnotation() {
  setAnnotationContent([
    createElement('div', 'annotation-empty', [
      createElement('span', 'annotation-mark', '✦'),
      createElement('p', '', '点击一个单词，或选中一段文字。'),
      createElement('small', '', '释义、翻译与学习笔记会显示在这里。')
    ])
  ]);
}
```

把 `showLoading` 与 `showError` 里的 `elements.annotationPanel.replaceChildren(...)` 改为 `setAnnotationContent([...])`：

```js
function showLoading(source) {
  setAnnotationContent([
    createElement('p', 'annotation-label', '正在查询'),
    createElement('p', 'annotation-source', source),
    createElement('p', 'annotation-translation', 'DeepSeek 正在整理适合六级精读的解释…')
  ]);
}

function showError(source, error) {
  setAnnotationContent([
    createElement('p', 'annotation-label', '暂时无法翻译'),
    createElement('p', 'annotation-source', source),
    createElement('p', 'annotation-translation', error.message)
  ]);
}
```

把 `renderArticleTranslation` 末尾的 `elements.annotationPanel.replaceChildren(...content);` 改为 `setAnnotationContent(content);`。

把 `askArticle` 里的 `elements.annotationPanel.replaceChildren(...)` 改为 `setAnnotationContent([...])`：

```js
    setAnnotationContent([
      createElement('p', 'annotation-label', '全文问答'),
      createElement('p', 'annotation-source', question),
      createElement('p', 'annotation-translation', result.answer)
    ]);
```

还有**第 6 处**：`translateText(scope, text)` 的成功分支（原 `elements.annotationPanel.replaceChildren(...)`）→

```js
    setAnnotationContent([
      createElement('p', 'annotation-label', `${scope === 'paragraph' ? '段落' : scope === 'sentence' ? '句子' : '短语'}翻译`),
      createElement('p', 'annotation-source', text),
      createElement('p', 'annotation-translation', result.translation)
    ]);
```

漏掉这一处的后果：选区翻译之后 `state.annotation` 仍是上一个单词的批注，`refreshSavedWordUi` 会把翻译结果覆盖成单词批注（执行时由实现者发现并修正）。

- [ ] **Step 2: 重写 renderWordAnnotation 的按钮区**

把 `renderWordAnnotation` 签名改为：

```js
function renderWordAnnotation(data, queriedWord, context, { animateSave = false } = {}) {
  const word = data.word || queriedWord;
```

把函数末尾这段（保存按钮 + 写入面板）：

```js
  const saveButton = createElement('button', 'primary-button save-word', '加入单词本  +');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => saveWordFromLookup(data, word, context));
  content.push(saveButton);
  elements.annotationPanel.replaceChildren(...content);
}
```

替换为：

```js
  content.push(renderAnnotationActions(data, word, context, animateSave));
  setAnnotationContent(content, { data, word, context });
}

function renderAnnotationActions(data, word, context, animateSave) {
  const actions = createElement('div', 'annotation-actions');
  if (isWordSaved(state.entries, word)) {
    const savedButton = createElement('button', `primary-button save-word is-saved${animateSave ? ' is-just-saved' : ''}`, '已加入单词本 ✓');
    savedButton.type = 'button';
    savedButton.disabled = true;
    savedButton.setAttribute('aria-disabled', 'true');
    const detailButton = createElement('button', 'text-button word-detail-link', '查看完整详情 →');
    detailButton.type = 'button';
    detailButton.addEventListener('click', () => openWordDetail(word, 'reader'));
    actions.append(savedButton, detailButton);
    return actions;
  }
  const saveButton = createElement('button', 'primary-button save-word', '加入单词本  +');
  saveButton.type = 'button';
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    saveButton.classList.add('is-saving');
    saveButton.textContent = '正在加入…';
    try {
      const result = await saveWordFromLookup(data, word, context);
      refreshSavedWordUi(word, { animate: Boolean(result?.added) });
    } catch (error) {
      saveButton.disabled = false;
      saveButton.classList.remove('is-saving');
      saveButton.textContent = '加入单词本  +';
      setReaderStatus(error.message);
    }
  });
  actions.append(saveButton);
  return actions;
}
```

- [ ] **Step 3: saveWord 返回是否新增**

把 `public/js/app.js` 第 2 行的 wordbook 导入整行替换为：

```js
import { addOrUpdateWord, createMarkdown, createWordSummary, filterWords, isWordSaved, savedWordKeys } from './wordbook.js';
```

把 `saveWord` 替换为：

```js
async function saveWord(entry) {
  const savedAt = new Date().toISOString().slice(0, 10);
  if (!state.articleId && state.article.trim()) await persistArticle(false);
  const alreadySaved = isWordSaved(state.entries, entry.word);
  const source = state.articleId ? {
    articleId: state.articleId,
    title: state.prestudy?.title || '未命名精读文章',
    count: countWordInArticle(state.article, entry.word)
  } : undefined;
  state.entries = addOrUpdateWord(state.entries, { ...entry, savedAt, source });
  localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
  renderWordbook();
  setReaderStatus(`“${entry.word}” ${alreadySaved ? '已更新到单词本' : '已加入单词本'}`);
  return { added: !alreadySaved };
}
```

把 `saveWordFromLookup` 末尾的 `saveWord({ ... });` 之前加 `return`，即最后一个语句改为：

```js
  return saveWord({
    word: data.word || fallbackWord,
    meaning: data.contextMeaning || senses[0]?.meaning || '待补充',
    partOfSpeech: senses[0]?.partOfSpeech || '词义',
    context,
    phrases: Array.isArray(data.phrases) ? data.phrases : [],
    senses: Array.isArray(data.senses) ? data.senses : [],
    example: data.example ?? null,
    importanceTags: Array.isArray(data.importanceTags) ? data.importanceTags : [],
    wordFormation: data.wordFormation ?? null,
    synonyms: Array.isArray(data.synonyms) ? data.synonyms : [],
    antonyms: Array.isArray(data.antonyms) ? data.antonyms : [],
    confusables: Array.isArray(data.confusables) ? data.confusables : [],
    extraExamples: Array.isArray(data.extraExamples) ? data.extraExamples : []
  });
```

- [ ] **Step 4: lookupWord 的两条保存路径播放入动画**

在 `lookupWord` 的缓存分支里，把：

```js
    if (saveAfterLookup) saveWordFromLookup(cached, word, context);
```

替换为：

```js
    if (saveAfterLookup) {
      const result = await saveWordFromLookup(cached, word, context);
      refreshSavedWordUi(word, { animate: Boolean(result?.added) });
    }
```

在查询分支里，把：

```js
    if (saveAfterLookup) saveWordFromLookup(data, word, context);
```

替换为：

```js
    if (saveAfterLookup) {
      const result = await saveWordFromLookup(data, word, context);
      refreshSavedWordUi(word, { animate: Boolean(result?.added) });
    }
```

- [ ] **Step 5: 语法检查**

Run: `node --check public/js/app.js`
Expected: 无输出。

## Task A6: 重点词卡片已收录标识与统一刷新

**Files:**
- Modify: `public/js/app.js`（`renderKeyVocabulary`、新增 `refreshSavedWordUi`、收录短语路径）

- [ ] **Step 1: 重写 renderKeyVocabulary**

把 `renderKeyVocabulary` 整体替换为：

```js
function renderKeyVocabulary({ animateWord = '' } = {}) {
  elements.keyVocabulary.replaceChildren();
  const vocabulary = Object.values(state.prestudy?.vocabulary ?? {});
  if (!vocabulary.length) {
    elements.keyVocabulary.append(createElement('p', 'book-empty', state.prestudyPending ? '正在准备本篇重点词…' : '本篇尚无可展示的重点词。'));
    return;
  }
  const saved = savedWordKeys(state.entries);
  const animateKey = String(animateWord ?? '').trim().toLowerCase();
  vocabulary.slice(0, 24).forEach((item) => {
    const key = String(item.word ?? '').trim().toLowerCase();
    const isSaved = saved.has(key);
    const classes = ['key-word-card'];
    if (isSaved) classes.push('is-saved');
    if (animateKey && key === animateKey) classes.push('is-just-saved');
    const button = createElement('button', classes.join(' '), [
      createElement('strong', '', item.word),
      createElement('span', '', item.contextMeaning || item.senses?.[0]?.meaning || '查看释义')
    ]);
    if (isSaved) {
      const check = createElement('span', 'key-word-card-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      button.append(check);
    }
    button.type = 'button';
    button.addEventListener('click', () => renderWordAnnotation(item, item.word, state.article));
    elements.keyVocabulary.append(button);
  });
}
```

- [ ] **Step 2: 新增 refreshSavedWordUi**

在 `renderKeyVocabulary` 之后插入：

```js
// 加入/移除单词后，面板、重点词卡片、单词本列表必须看到同一份状态。
function refreshSavedWordUi(word, { animate = false } = {}) {
  const key = String(word ?? '').trim().toLowerCase();
  renderKeyVocabulary({ animateWord: animate ? key : '' });
  if (state.annotation && String(state.annotation.word ?? '').trim().toLowerCase() === key) {
    renderWordAnnotation(state.annotation.data, state.annotation.word, state.annotation.context, { animateSave: animate });
  }
  renderWordbook();
}
```

- [ ] **Step 3: 收录短语后同步状态**

把 `#save-selection-phrase` 处理器里这一句：

```js
    await saveWord({ word: phrase, meaning: result.translation, partOfSpeech: '短语', context: phrase, entryType: 'phrase' });
```

替换为：

```js
    const saved = await saveWord({ word: phrase, meaning: result.translation, partOfSpeech: '短语', context: phrase, entryType: 'phrase' });
    refreshSavedWordUi(phrase, { animate: Boolean(saved?.added) });
```

- [ ] **Step 4: 语法检查**

Run: `node --check public/js/app.js`
Expected: 无输出。

- [ ] **Step 5: 两个纯模块测试一起跑**

Run: `node test/wordbook.test.js` 然后 `node test/view-nav.test.js`
Expected: 两个文件都 `fail 0`。

- [ ] **Step 6: 提交**

```bash
git add public/js/app.js test/wordbook.test.js
git commit -m "feat(reader): 面板可进入完整单词详情并显示已收录状态"
```

## Task A7: 已收录态与加入动画样式

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: 加样式**

在 `.save-word { width: 100%; margin-top: 24px; }` 之后插入：

```css
.annotation-actions { display: grid; gap: 10px; margin-top: 24px; }
.annotation-actions .save-word { margin-top: 0; }
.word-detail-link { justify-self: center; }
.save-word.is-saving { animation: save-word-press .3s ease; }
.save-word.is-just-saved { animation: save-word-pop .5s cubic-bezier(.2, .9, .3, 1.4), save-word-ring .7s ease-out; }
.save-word.is-saved { color: var(--green-dark); background: rgba(23, 105, 90, .12); box-shadow: none; }
.key-word-card { position: relative; }
.key-word-card.is-saved strong { color: var(--green); }
.key-word-card .key-word-card-check { position: absolute; top: 9px; right: 10px; display: grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; color: #fffdf6; background: var(--green); font-size: 11px; line-height: 1; }
.key-word-card.is-just-saved .key-word-card-check { animation: key-word-check-pop .42s cubic-bezier(.2, .9, .3, 1.4); }
@keyframes save-word-press { 50% { transform: translate(2px, 2px) scale(.99); } }
@keyframes save-word-pop { 35% { transform: scale(1.04); } }
@keyframes save-word-ring { from { box-shadow: 0 0 0 0 rgba(23, 105, 90, .45); } to { box-shadow: 0 0 0 16px rgba(23, 105, 90, 0); } }
@keyframes key-word-check-pop { from { transform: scale(.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .save-word.is-saving, .save-word.is-just-saved, .key-word-card.is-just-saved .key-word-card-check { animation: none; }
}
```

注意：`html[data-theme="dark"]` 里 `.save-word.is-saved` 的背景色需要覆盖，追加：

```css
html[data-theme="dark"] .save-word.is-saved { color: var(--green); background: rgba(114, 187, 167, .16); }
```

- [ ] **Step 2: 手工验证（本阶段第一次看真实页面）**

Run: `npm start`，浏览器打开 `http://localhost:3000`，粘贴一篇有重点词的文章 → 点一个词 →
Expected：按钮「加入单词本 +」；点击后出现按压/涟漪，随按钮变成「已加入单词本 ✓」（不可再点）并出现「查看完整详情 →」；上方重点词卡片对应那张出现 ✓ 徽标并有一次缩放动画。

- [ ] **Step 3: 提交**

```bash
git add public/styles.css
git commit -m "style(reader): 加入单词本按钮与重点词卡片的已收录反馈"
```

## Task A8: 手工冒烟清单（返回关系与状态同步）

**Files:** 无（验证任务）

- [ ] **Step 1: 逐条验证并记录结果**

启动 `npm start`，在浏览器里依次做：

1. 原文页点词 → 加入 → 「查看完整详情 →」：进入整页详情，顶部导航**不高亮**「单词本」，返回按钮写「← 返回原文」。
2. 详情页点返回：回到原文页，且**滚动位置与离开时一致**，面板仍是那个词并显示「已加入单词本 ✓」。
3. 详情页点「从单词本移除」：回到原文页，面板退回「加入单词本 +」且「查看完整详情 →」消失，重点词卡片 ✓ 徽标消失。
4. 单词本列表点一行：详情页返回按钮写「← 返回单词本」，返回后回到单词本列表（滚动位置保留）。
5. 从「我的精读」进单词本 → 点单词本右上角 ×：回到「我的精读」而不是原文页。
6. 详情页里点顶部「单词本」导航 → 详情页里点 × → 应回到进入单词本之前的视图（不是又跳进详情页）。
7. 语境菜单（右键单词）→「加入单词本」：与面板按钮一样出现已收录动画与状态。

Expected：7 条全部符合；任一条不符时先修该条再继续。

## Task A9: 扩展 e2e 断言（可选，需要 Playwright）

**Files:**
- Modify: `test/e2e.py`

- [ ] **Step 1: 加断言**

先把握手改成带重试断言的导入：`from playwright.sync_api import expect, sync_playwright`。

在 `test/e2e.py` 的 `page.get_by_role("button", name="开始精读").click()` 之后插入（**必须用 `expect()` 而不是 `count()`/`is_visible()`**：`.save-word` 的点击处理器是 `await saveWordFromLookup(...)` 的异步流程，非重试断言会 flaky）：

```python
        # 需要可用的 /api/translate（DeepSeek Key + 网络）；离线环境下这几步会超时失败。
        page.locator(".word-token").first.click()
        page.locator(".save-word").click()
        expect(page.locator(".save-word.is-saved")).to_have_count(1)
        expect(page.locator(".word-detail-link")).to_be_visible()
        page.locator(".word-detail-link").click()
        expect(page.locator("#word-detail-view")).to_be_visible()
        expect(page.get_by_role("button", name="返回原文")).to_be_visible()
        page.get_by_role("button", name="返回原文").click()
        expect(page.locator("#reader-view")).to_be_visible()
```

- [ ] **Step 2: 运行（需要 Playwright）**

Run: `npm start`（另开终端）+ `python test/e2e.py`
Expected: 无断言错误；本机未装 Playwright 时跳过此任务，Task A8 的手工清单为准。

- [ ] **Step 3: 提交**

```bash
git add test/e2e.py
git commit -m "test(e2e): 覆盖单词详情入口与返回原文"
```

---

# 第二阶段：单词本来源筛选（文件夹式多层多选）

## Task B1: 选择模型（纯函数）

**Files:**
- Create: `public/js/word-sources.js`
- Test: `test/word-sources.test.js`

- [ ] **Step 1: 写失败测试**

创建 `test/word-sources.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSelection, selectAll, toggleArticle, toggleFolder, toggleUnfiled, toggleUnlinked } from '../public/js/word-sources.js';

const tree = {
  folders: [
    { id: 'f1', name: '听力文件夹', articleIds: ['a1', 'a2'], articles: [], count: 3 },
    { id: 'f2', name: '阅读文件夹', articleIds: ['a3'], articles: [], count: 1 }
  ],
  unfiled: { articleIds: ['a9'], articles: [], count: 1 },
  unlinked: { count: 2 },
  total: 6
};

test('默认是全部单词', () => {
  assert.deepEqual(selectAll(), { all: true, articleIds: [], includeUnlinked: false });
});

test('全部单词状态下勾一项等于只看这一项', () => {
  assert.deepEqual(toggleArticle(selectAll(), 'a1'), { all: false, articleIds: ['a1'], includeUnlinked: false });
});

test('再点一次取消该文章', () => {
  const selection = toggleArticle(toggleArticle(selectAll(), 'a1'), 'a1');
  assert.deepEqual(selection, { all: true, articleIds: [], includeUnlinked: false });
});

test('勾文件夹一次选中其中全部文章', () => {
  assert.deepEqual(toggleFolder(selectAll(), tree, 'f1').articleIds, ['a1', 'a2']);
});

test('文件夹全选后再次点击清空该文件夹', () => {
  const selection = toggleFolder(toggleFolder(selectAll(), tree, 'f1'), tree, 'f1');
  assert.deepEqual(selection, { all: true, articleIds: [], includeUnlinked: false });
});

test('文件夹半选时点击补齐而不是清空', () => {
  const partial = toggleArticle(selectAll(), 'a1');
  assert.deepEqual(toggleFolder(partial, tree, 'f1').articleIds, ['a1', 'a2']);
});

test('未归档按同一套逻辑集体勾选', () => {
  assert.deepEqual(toggleUnfiled(selectAll(), tree).articleIds, ['a9']);
});

test('未关联文章可以单独勾选', () => {
  assert.deepEqual(toggleUnlinked(selectAll()), { all: false, articleIds: [], includeUnlinked: true });
});

test('取消最后一个选择回到全部单词', () => {
  const only = toggleArticle(selectAll(), 'a1');
  assert.deepEqual(toggleArticle(only, 'a1'), { all: true, articleIds: [], includeUnlinked: false });
});

test('清空选择等于回到全部单词', () => {
  assert.deepEqual(clearSelection(), selectAll());
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/word-sources.test.js`
Expected: FAIL —— 找不到模块。

- [ ] **Step 3: 实现**

创建 `public/js/word-sources.js`：

```js
// 单词本来源筛选：选择模型、来源树、命中过滤与文案，全部为纯函数。
export function selectAll() {
  return { all: true, articleIds: [], includeUnlinked: false };
}

export function clearSelection() {
  return selectAll();
}

// 从“全部单词”开始做显式多选时，先清空隐式的全选。
function explicitBase(selection) {
  if (!selection || selection.all) return { all: false, articleIds: [], includeUnlinked: false };
  return {
    all: false,
    articleIds: [...new Set((selection.articleIds ?? []).map(String))],
    includeUnlinked: Boolean(selection.includeUnlinked)
  };
}

// 选择集为空就等于没有筛选，回到全部单词，避免空列表。
function settle(selection) {
  return selection.articleIds.length || selection.includeUnlinked ? selection : selectAll();
}

export function toggleGroup(selection, articleIds) {
  const base = explicitBase(selection);
  const ids = [...new Set((Array.isArray(articleIds) ? articleIds : []).map(String).filter(Boolean))];
  if (!ids.length) return settle(base);
  const allSelected = ids.every((id) => base.articleIds.includes(id));
  const nextIds = allSelected
    ? base.articleIds.filter((id) => !ids.includes(id))
    : [...new Set([...base.articleIds, ...ids])];
  return settle({ ...base, articleIds: nextIds });
}

export function toggleArticle(selection, articleId) {
  return toggleGroup(selection, [articleId]);
}

export function toggleFolder(selection, tree, folderId) {
  const folder = (tree?.folders ?? []).find((item) => item.id === folderId);
  return toggleGroup(selection, folder?.articleIds ?? []);
}

export function toggleUnfiled(selection, tree) {
  return toggleGroup(selection, tree?.unfiled?.articleIds ?? []);
}

export function toggleUnlinked(selection) {
  const base = explicitBase(selection);
  return settle({ ...base, includeUnlinked: !base.includeUnlinked });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/word-sources.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/word-sources.js test/word-sources.test.js
git commit -m "feat(wordbook): 增加来源多选模型"
```

## Task B2: 来源树（文件夹 → 文章 → 单词数）

**Files:**
- Modify: `public/js/word-sources.js`
- Test: `test/word-sources.test.js`

- [ ] **Step 1: 写失败测试**

在 `test/word-sources.test.js` 的 import 里加 `createSourceTree`，并追加：

```js
const entries = [
  { word: 'critical', sources: { a1: { title: '对话一', count: 2 }, a3: { title: '长篇一', count: 1 } } },
  { word: 'evidence', sources: { a1: { title: '对话一', count: 1 } } },
  { word: 'judgment', sources: { a9: { title: '未归档文章', count: 1 } } },
  { word: 'phrase one', entryType: 'phrase' },
  { word: 'gone', sources: { a404: { title: '已删除的文章', count: 1 } } }
];
const articles = [
  { id: 'a1', title: '对话一', folderId: 'f1' },
  { id: 'a2', title: '对话二', folderId: 'f1' },
  { id: 'a3', title: '长篇一', folderId: '' },
  { id: 'a9', title: '未归档文章', folderId: '' }
];
const folders = [{ id: 'f1', name: '听力文件夹' }, { id: 'f2', name: '空文件夹' }];

test('来源树按文件夹聚合并给出各层单词数', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.deepEqual(tree.folders.map((folder) => folder.id), ['f1']);
  assert.deepEqual(tree.folders[0].articleIds, ['a1']);
  assert.equal(tree.folders[0].count, 2);
  assert.deepEqual(tree.unfiled.articleIds.sort(), ['a3', 'a404', 'a9']);
  assert.equal(tree.unfiled.count, 3);
  assert.equal(tree.unlinked.count, 1);
  assert.equal(tree.total, 5);
});

test('文章不在精读库里时按条目里保存的标题落到未归档', () => {
  const tree = createSourceTree(entries, articles, folders);
  const gone = tree.unfiled.articles.find((article) => article.id === 'a404');
  assert.equal(gone.title, '已删除的文章');
});

test('没有单词的文件夹不出现', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.equal(tree.folders.some((folder) => folder.id === 'f2'), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/word-sources.test.js`
Expected: FAIL —— `createSourceTree is not a function`。

- [ ] **Step 3: 实现**

在 `public/js/word-sources.js` 里 `selectAll` 之前插入：

```js
export function createSourceTree(entries, articles, folders) {
  const list = Array.isArray(entries) ? entries : [];
  const articleList = Array.isArray(articles) ? articles : [];
  const folderList = Array.isArray(folders) ? folders : [];
  const entryArticleIds = list.map((entry) => Object.keys(entry?.sources ?? {}));
  const storedTitles = new Map();
  for (const entry of list) {
    for (const [articleId, source] of Object.entries(entry?.sources ?? {})) {
      if (!storedTitles.has(articleId)) storedTitles.set(articleId, String(source?.title ?? '未命名精读文章'));
    }
  }
  const known = new Map(articleList.map((article) => [String(article?.id ?? ''), article]));
  const nodes = new Map();
  entryArticleIds.flat().forEach((articleId) => {
    if (nodes.has(articleId)) return;
    const article = known.get(articleId);
    nodes.set(articleId, {
      id: articleId,
      title: String(article?.title || storedTitles.get(articleId) || '未命名精读文章'),
      folderId: article ? String(article.folderId ?? '') : '',
      count: entryArticleIds.filter((ids) => ids.includes(articleId)).length
    });
  });
  const byTitle = (items) => items.slice().sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  const countDistinct = (ids) => entryArticleIds.filter((entryIds) => entryIds.some((id) => ids.includes(id))).length;
  const folderIds = new Set(folderList.map((folder) => String(folder?.id ?? '')));
  const treeFolders = folderList.map((folder) => {
    const id = String(folder?.id ?? '');
    const articlesInFolder = byTitle([...nodes.values()].filter((node) => node.folderId === id));
    return {
      id,
      name: String(folder?.name ?? '未命名文件夹'),
      articleIds: articlesInFolder.map((node) => node.id),
      articles: articlesInFolder,
      count: countDistinct(articlesInFolder.map((node) => node.id))
    };
  }).filter((folder) => folder.articleIds.length > 0);
  const unfiledArticles = byTitle([...nodes.values()].filter((node) => !node.folderId || !folderIds.has(node.folderId)));
  return {
    folders: treeFolders,
    unfiled: {
      articleIds: unfiledArticles.map((node) => node.id),
      articles: unfiledArticles,
      count: countDistinct(unfiledArticles.map((node) => node.id))
    },
    unlinked: { count: list.filter((entry) => Object.keys(entry?.sources ?? {}).length === 0).length },
    total: list.length
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/word-sources.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/word-sources.js test/word-sources.test.js
git commit -m "feat(wordbook): 构建文件夹式来源树"
```

## Task B3: 命中过滤与三态

**Files:**
- Modify: `public/js/word-sources.js`
- Test: `test/word-sources.test.js`

- [ ] **Step 1: 写失败测试**

import 里加 `filterEntriesBySource, groupCheckState`，追加：

```js
test('多选来源取并集且不重复', () => {
  const selection = { all: false, articleIds: ['a1', 'a3'], includeUnlinked: false };
  assert.deepEqual(filterEntriesBySource(entries, selection).map((entry) => entry.word), ['critical', 'evidence']);
});

test('未关联文章只在勾选时命中', () => {
  assert.deepEqual(filterEntriesBySource(entries, { all: false, articleIds: ['a1'], includeUnlinked: true }).map((entry) => entry.word), ['critical', 'evidence', 'phrase one']);
});

test('全部单词命中所有条目', () => {
  assert.equal(filterEntriesBySource(entries, selectAll()).length, entries.length);
});

test('文件夹勾选框三态', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.equal(groupCheckState(['a1'], selectAll()), 'all');
  assert.equal(groupCheckState(['a1'], toggleArticle(selectAll(), 'a1')), 'all');
  assert.equal(groupCheckState(['a1', 'a2'], toggleArticle(selectAll(), 'a1')), 'some');
  assert.equal(groupCheckState(['a2'], toggleArticle(selectAll(), 'a1')), 'none');
  assert.equal(groupCheckState([], selectAll()), 'none');
  assert.equal(tree.folders[0].articleIds.length, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/word-sources.test.js`
Expected: FAIL —— `filterEntriesBySource is not a function`。

- [ ] **Step 3: 实现**

在 `public/js/word-sources.js` 末尾追加：

```js
export function filterEntriesBySource(entries, selection) {
  const list = Array.isArray(entries) ? entries : [];
  if (!selection || selection.all) return list;
  const ids = new Set((selection.articleIds ?? []).map(String));
  return list.filter((entry) => {
    const sourceIds = Object.keys(entry?.sources ?? {});
    if (sourceIds.some((id) => ids.has(id))) return true;
    return Boolean(selection.includeUnlinked) && sourceIds.length === 0;
  });
}

export function groupCheckState(articleIds, selection) {
  const ids = Array.isArray(articleIds) ? articleIds : [];
  if (!selection || selection.all) return ids.length ? 'all' : 'none';
  if (!ids.length) return 'none';
  const selected = ids.filter((id) => (selection.articleIds ?? []).includes(id)).length;
  if (selected === 0) return 'none';
  return selected === ids.length ? 'all' : 'some';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/word-sources.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/word-sources.js test/word-sources.test.js
git commit -m "feat(wordbook): 来源命中过滤与三态勾选"
```

## Task B4: 触发按钮文案

**Files:**
- Modify: `public/js/word-sources.js`
- Test: `test/word-sources.test.js`

- [ ] **Step 1: 写失败测试**

import 里加 `describeSelection`，追加：

```js
test('未筛选时按钮显示全部单词', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.deepEqual(describeSelection(selectAll(), tree, entries), { label: '全部单词', detail: '', active: false });
});

test('选中整文件夹显示文件夹名', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.equal(describeSelection(toggleFolder(selectAll(), tree, 'f1'), tree, entries).label, '听力文件夹');
});

test('多选时显示首项与其余数量', () => {
  const tree = createSourceTree(entries, articles, folders);
  const selection = { all: false, articleIds: ['a1', 'a3'], includeUnlinked: false };
  const described = describeSelection(selection, tree, entries);
  assert.equal(described.label, '对话一 +1 项');
  assert.equal(described.detail, '已选 2 项 · 2 个单词');
  assert.equal(described.active, true);
});

test('只勾未关联文章时的文案', () => {
  const tree = createSourceTree(entries, articles, folders);
  assert.equal(describeSelection(toggleUnlinked(selectAll()), tree, entries).label, '未关联文章');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/word-sources.test.js`
Expected: FAIL —— `describeSelection is not a function`。

- [ ] **Step 3: 实现**

在 `public/js/word-sources.js` 末尾追加：

```js
function findArticle(tree, articleId) {
  const pools = [...(tree?.folders ?? []).flatMap((folder) => folder.articles ?? []), ...(tree?.unfiled?.articles ?? [])];
  return pools.find((article) => article.id === articleId);
}

export function describeSelection(selection, tree, entries) {
  if (!selection || selection.all) return { label: '全部单词', detail: '', active: false };
  const articleIds = (selection.articleIds ?? []).map(String);
  const includeUnlinked = Boolean(selection.includeUnlinked);
  const wholeFolder = (tree?.folders ?? []).find((folder) => (
    !includeUnlinked &&
    folder.articleIds.length > 0 &&
    folder.articleIds.length === articleIds.length &&
    folder.articleIds.every((id) => articleIds.includes(id))
  ));
  const names = articleIds.map((id) => findArticle(tree, id)?.title ?? '已删除的文章');
  if (includeUnlinked) names.push('未关联文章');
  const label = wholeFolder
    ? wholeFolder.name
    : names.length === 1
      ? names[0]
      : names.length
        ? `${names[0]} +${names.length - 1} 项`
        : '全部单词';
  const wordCount = filterEntriesBySource(entries, selection).length;
  return { label, detail: `已选 ${names.length} 项 · ${wordCount} 个单词`, active: true };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/word-sources.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/word-sources.js test/word-sources.test.js
git commit -m "feat(wordbook): 来源筛选按钮文案"
```

## Task B5: filterWords 交给来源过滤模块

**Files:**
- Modify: `public/js/wordbook.js`
- Test: `test/wordbook.test.js`

- [ ] **Step 1: 改测试（先失败）**

把 `test/wordbook.test.js` 里「单词本可按搜索词和来源文章筛选」这个测试整体替换为：

```js
test('单词本搜索词仍会匹配来源文章标题', () => {
  const entries = [{ word: 'critical', meaning: '关键的', sources: { a1: { title: '批判性阅读', count: 2 } } }, { word: 'evidence', meaning: '证据' }];
  assert.deepEqual(filterWords(entries, { query: '批判' }).map((item) => item.word), ['critical']);
  assert.deepEqual(filterWords(entries, { query: '证据' }).map((item) => item.word), ['evidence']);
});

test('来源筛选不再由 filterWords 负责', () => {
  const entries = [{ word: 'critical', sources: { a1: { title: '批判性阅读' } } }, { word: 'evidence', sources: {} }];
  assert.deepEqual(filterWords(entries, { sourceId: 'a1' }).map((item) => item.word), ['critical', 'evidence']);
});
```

第一条锁定「搜索框仍能按来源文章标题搜」这个既有功能（`placeholder` 里写着“搜索单词、释义或来源文章”），第二条锁定来源筛选已移交 `filterEntriesBySource`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/wordbook.test.js`
Expected: FAIL —— 「来源筛选不再由 filterWords 负责」失败：旧实现仍按 `sourceId` 过滤，只返回 `['critical']`。第一条应通过（它是回归保护）。

- [ ] **Step 3: 实现**

把 `filterWords` 里的 `sourceMatches` 与 `sourceId` 去掉，其余保持原样：

```js
export function filterWords(entries, { query = '', status = '', tag = '' } = {}) {
  const keyword = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const sources = entry.sources ?? {};
    const searchable = [entry.word, entry.meaning, ...Object.values(sources).map((source) => source.title)].join(' ').toLowerCase();
    const statusMatches = !status || (entry.learningStatus ?? 'unknown') === status;
    const tagMatches = !tag || (entry.importanceTags ?? []).includes(tag);
    return statusMatches && tagMatches && (!keyword || searchable.includes(keyword));
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/wordbook.test.js`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add public/js/wordbook.js test/wordbook.test.js
git commit -m "refactor(wordbook): 来源筛选改由 word-sources 负责"
```

## Task B6: 筛选控件骨架与样式

> **注意：B6 不能单独落地。** 一旦从 `index.html` 移除 `<select id="word-source-filter">`，`app.js` 里 `elements.wordSourceFilter.addEventListener('change', ...)`（模块顶层）与 `renderWordbook()` 里的 `.value` 读取会立刻抛 `TypeError`，整页初始化中断。B6 必须与 B7、B8 在同一个提交里完成（执行时即如此处理）。

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

- [ ] **Step 1: 替换筛选控件**

把 `public/index.html` 第 110 行整行替换为：

```html
      <div class="wordbook-filters"><input id="word-search" type="search" placeholder="搜索单词、释义或来源文章" /><div class="word-source-filter"><button id="word-source-trigger" class="word-source-trigger" type="button" aria-haspopup="true" aria-expanded="false"><span id="word-source-label">来源：全部单词</span><span id="word-source-detail" class="word-source-detail"></span><span class="word-source-caret" aria-hidden="true">▾</span></button><button id="word-source-clear" class="word-source-clear" type="button" hidden aria-label="清空来源筛选">×</button><div id="word-source-panel" class="word-source-panel" hidden role="group" aria-label="来源筛选"></div></div></div>
```

- [ ] **Step 2: 加样式**

在 `public/styles.css` 的 `.wordbook-filters input, .wordbook-filters select { ... }` 之后插入：

```css
.word-source-filter { position: relative; }
.wordbook-filters .word-source-trigger { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; width: 100%; border: 1px solid var(--line); padding: 11px; color: var(--ink); background: transparent; font: inherit; text-align: left; }
.word-source-trigger:hover, .word-source-trigger[aria-expanded="true"] { border-color: var(--green); }
.word-source-trigger.is-filtered { border-color: var(--green); color: var(--green-dark); font-weight: 800; }
.word-source-detail { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
.word-source-caret { color: var(--green); font-size: 11px; }
.word-source-clear { position: absolute; top: -8px; right: -8px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; color: #fffdf6; background: var(--green); font-size: 13px; line-height: 1; }
.word-source-panel { position: absolute; z-index: 20; top: calc(100% + 8px); right: 0; width: min(430px, 92vw); max-height: min(60vh, 430px); overflow-y: auto; padding: 16px 18px 14px; border-top: 5px solid var(--green); color: var(--ink); background: #f7f1e5; box-shadow: 9px 10px 0 rgba(25, 42, 32, .12); }
html[data-theme="dark"] .word-source-panel { background: #202d28; }
.source-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.source-breadcrumb button { border: 0; padding: 0; color: var(--green-dark); background: transparent; font: inherit; text-decoration: underline; text-underline-offset: 3px; }
.source-group-toggle { margin-left: auto; }
.source-rows { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.source-row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 10px; padding: 9px 6px; border-radius: 2px; }
.source-row:hover { background: rgba(23, 105, 90, .07); }
.source-row label { display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 700; }
.source-row input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--green); cursor: pointer; }
.source-row-count { color: var(--ink-soft); font-size: 11px; }
.source-enter { border: 0; padding: 2px 4px; color: var(--green-dark); background: transparent; font-size: 14px; }
.source-section-title { margin: 12px 0 4px; color: var(--green); font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.source-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.source-empty { margin: 6px 0 0; color: var(--ink-soft); font-size: 12px; }
```

- [ ] **Step 3: 提交**

```bash
git add public/index.html public/styles.css
git commit -m "feat(wordbook): 来源筛选控件骨架与样式"
```

## Task B7: 精读库索引缓存与视图接线

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: state 与 elements**

在 `state` 里 `notes: {},` 之前插入：

```js
  libraryIndex: { articles: [], folders: [] },
  sourceSelection: selectAll(),
  sourceBrowse: { level: 'root', folderId: '' },
  sourceFocusKey: '',
```

import 里加：

```js
import { clearSelection, createSourceTree, describeSelection, filterEntriesBySource, groupCheckState, selectAll, toggleArticle, toggleFolder, toggleUnfiled, toggleUnlinked } from './word-sources.js';
```

把 `elements` 里的 `wordSourceFilter: document.querySelector('#word-source-filter'),` 替换为：

```js
  sourceTrigger: document.querySelector('#word-source-trigger'),
  sourceLabel: document.querySelector('#word-source-label'),
  sourceDetail: document.querySelector('#word-source-detail'),
  sourceClear: document.querySelector('#word-source-clear'),
  sourcePanel: document.querySelector('#word-source-panel'),
```

- [ ] **Step 2: renderArticleLibrary 顺手刷新索引**

把 `renderArticleLibrary` 里这段：

```js
    if (renderId !== state.libraryRenderId) return;
    const articles = dedupeArticles(storedArticles);
```

替换为：

```js
    if (renderId !== state.libraryRenderId) return;
    // 单词本按文件夹归类要用到这份索引，这里已有现成结果，顺手缓存。
    state.libraryIndex = {
      articles: storedArticles.map((article) => ({ id: article.id, title: article.title, folderId: article.folderId || '' })),
      folders: folders.map((folder) => ({ id: folder.id, name: folder.name }))
    };
    // 索引变了就同步单词本（含空文章库、删除文件夹、改文章文件夹等所有分支）。
    if (state.view === 'wordbook') renderWordbook();
    const articles = dedupeArticles(storedArticles);
```

放在这个位置是因为函数后面还有「没有文章时提前 return」的分支，写在末尾会漏掉那种情况。

- [ ] **Step 3: 进入单词本时刷新索引与面板**

把 `switchView` 里的：

```js
  if (view === 'wordbook') renderWordbook();
```

替换为：

```js
  if (view === 'wordbook') {
    renderWordbook();
    renderArticleLibrary();
  }
```

`renderWordbook` 内部会刷新触发按钮与打开着的面板；紧接着的 `renderArticleLibrary()` 刷新精读库索引，落地后若仍停在单词本会再渲染一次（先用缓存快速出图，再用最新索引校正）。

- [ ] **Step 4: 语法检查**

Run: `node --check public/js/app.js`
Expected: 无输出（`renderSourceFilter` 在 Task B8 实现，此处先接线）。

## Task B8: 来源浏览面板

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: 组合来源筛选进 renderWordbook**

把 `renderWordbook` 里这两段：

```js
  const selectedSource = elements.wordSourceFilter.value;
  const sources = new Map();
  state.entries.forEach((entry) => Object.entries(entry.sources ?? {}).forEach(([id, source]) => sources.set(id, source.title)));
  elements.wordSourceFilter.replaceChildren(new Option('全部来源文章', ''));
  sources.forEach((title, id) => elements.wordSourceFilter.add(new Option(title, id)));
  elements.wordSourceFilter.value = sources.has(selectedSource) ? selectedSource : '';
  elements.wordbookList.replaceChildren();
  const visibleEntries = filterWords(state.entries, { query: elements.wordSearch.value, sourceId: elements.wordSourceFilter.value, ...state.wordFilters });
  if (visibleEntries.length === 0) {
    elements.wordbookList.append(createElement('p', 'book-empty', '这里还没有单词。阅读时点击任意单词，再选择“加入单词本”。'));
    return;
  }
```

替换为：

```js
  elements.wordbookList.replaceChildren();
  const tree = createSourceTree(state.entries, state.libraryIndex.articles, state.libraryIndex.folders);
  const scoped = filterEntriesBySource(state.entries, state.sourceSelection);
  const visibleEntries = filterWords(scoped, { query: elements.wordSearch.value, ...state.wordFilters });
  renderSourceFilter();
  if (visibleEntries.length === 0) {
    const message = state.entries.length === 0
      ? '这里还没有单词。阅读时点击任意单词，再选择“加入单词本”。'
      : state.sourceSelection.all
        ? '当前搜索或状态筛选下没有单词。'
        : `“${describeSelection(state.sourceSelection, tree, state.entries).label}”下没有匹配的单词。`;
    elements.wordbookList.append(createElement('p', 'book-empty', message));
    return;
  }
```

- [ ] **Step 2: 渲染触发按钮**

在 `renderWordbook` 之前插入：

```js
function renderSourceFilter(tree = createSourceTree(state.entries, state.libraryIndex.articles, state.libraryIndex.folders)) {
  const described = describeSelection(state.sourceSelection, tree, state.entries);
  elements.sourceLabel.textContent = `来源：${described.label}`;
  elements.sourceDetail.textContent = described.detail;
  elements.sourceTrigger.classList.toggle('is-filtered', described.active);
  elements.sourceClear.hidden = !described.active;
  if (!elements.sourcePanel.hidden) renderSourcePanel(tree);
}
```

面板重渲染只走这一条路径（`renderWordbook` → `renderSourceFilter` → `renderSourcePanel`），保证每一次筛选交互只渲染一次、焦点恢复不被覆盖。注意：进入单词本视图时会渲染两次（`switchView` 一次 + `renderArticleLibrary` 索引落地后一次），第二次会重建面板；此时面板通常还没打开，实际影响很小（详见执行记录里的已知问题）。

- [ ] **Step 3: 渲染面板**

在 `renderSourceFilter` 之后插入：

```js
function renderSourcePanel(tree = createSourceTree(state.entries, state.libraryIndex.articles, state.libraryIndex.folders)) {
  const fragments = [];
  const addRow = (key, label, count, checked, onChange, enter) => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked !== 'none';
    input.indeterminate = checked === 'some';
    input.dataset.focusKey = key;
    input.addEventListener('change', onChange);
    const row = createElement('li', 'source-row', [createElement('label', '', [input, createElement('span', '', label)]), createElement('span', 'source-row-count', `${count} 词`)]);
    if (enter) {
      const button = createElement('button', 'source-enter', '›');
      button.type = 'button';
      button.setAttribute('aria-label', `进入 ${label}`);
      button.addEventListener('click', enter);
      row.append(button);
    }
    fragments.push(row);
  };

  if (state.sourceBrowse.level === 'root') {
    const everything = document.createElement('input');
    everything.type = 'checkbox';
    everything.checked = state.sourceSelection.all;
    everything.dataset.focusKey = 'all';
    everything.addEventListener('change', () => applySourceSelection(selectAll(), 'all'));
    fragments.push(createElement('li', 'source-row', [createElement('label', '', [everything, createElement('span', '', '全部单词')]), createElement('span', 'source-row-count', `${tree.total} 词`)]));
    tree.folders.forEach((folder) => {
      addRow(`folder:${folder.id}`, folder.name, folder.count, groupCheckState(folder.articleIds, state.sourceSelection), () => applySourceSelection(toggleFolder(state.sourceSelection, tree, folder.id), `folder:${folder.id}`), () => { state.sourceBrowse = { level: 'folder', folderId: folder.id }; state.sourceFocusKey = 'back'; renderSourcePanel(); });
    });
    if (tree.unfiled.articleIds.length) {
      addRow('unfiled', '未归档', tree.unfiled.count, groupCheckState(tree.unfiled.articleIds, state.sourceSelection), () => applySourceSelection(toggleUnfiled(state.sourceSelection, tree), 'unfiled'), () => { state.sourceBrowse = { level: 'unfiled', folderId: '' }; state.sourceFocusKey = 'back'; renderSourcePanel(); });
    }
    if (tree.unlinked.count) {
      addRow('unlinked', '未关联文章', tree.unlinked.count, state.sourceSelection.includeUnlinked ? 'all' : 'none', () => applySourceSelection(toggleUnlinked(state.sourceSelection), 'unlinked'));
    }
  } else {
    const isUnfiled = state.sourceBrowse.level === 'unfiled';
    const folder = tree.folders.find((item) => item.id === state.sourceBrowse.folderId);
    const group = isUnfiled ? tree.unfiled : folder ?? { articleIds: [], articles: [], count: 0, name: '' };
    const back = createElement('button', 'source-enter', '← 全部来源');
    back.type = 'button';
    back.dataset.focusKey = 'back';
    back.addEventListener('click', () => { state.sourceBrowse = { level: 'root', folderId: '' }; state.sourceFocusKey = 'back'; renderSourcePanel(tree); });
    const groupToggle = createElement('button', 'text-button source-group-toggle', groupCheckState(group.articleIds, state.sourceSelection) === 'all' ? '本文件夹全不选' : '本文件夹全选');
    groupToggle.type = 'button';
    groupToggle.dataset.focusKey = 'group';
    groupToggle.addEventListener('click', () => applySourceSelection(
      isUnfiled ? toggleUnfiled(state.sourceSelection, tree) : toggleFolder(state.sourceSelection, tree, state.sourceBrowse.folderId),
      'group'
    ));
    fragments.push(createElement('li', 'source-breadcrumb', [back, createElement('span', '', isUnfiled ? '未归档' : group.name), groupToggle]));
    group.articles.forEach((article) => {
      addRow(`article:${article.id}`, article.title, article.count, groupCheckState([article.id], state.sourceSelection), () => applySourceSelection(toggleArticle(state.sourceSelection, article.id), `article:${article.id}`));
    });
  }

  const clear = createElement('button', 'text-button source-clear-all', '清空来源筛选');
  clear.type = 'button';
  clear.addEventListener('click', () => applySourceSelection(clearSelection(), ''));
  const done = createElement('button', 'quiet-button source-done', '完成');
  done.type = 'button';
  done.addEventListener('click', closeSourcePanel);
  const list = createElement('ul', 'source-rows', fragments);
  const actions = createElement('div', 'source-actions', [clear, done]);
  elements.sourcePanel.replaceChildren(list, actions);
  if (state.sourceFocusKey) {
    const target = elements.sourcePanel.querySelector(`[data-focus-key="${state.sourceFocusKey}"]`);
    state.sourceFocusKey = '';
    target?.focus();
  }
}

function applySourceSelection(selection, focusKey) {
  state.sourceSelection = selection;
  state.sourceFocusKey = focusKey;
  renderWordbook();
}

function openSourcePanel() {
  state.sourceBrowse = { level: 'root', folderId: '' };
  state.sourceFocusKey = '';
  elements.sourcePanel.hidden = false;
  elements.sourceTrigger.setAttribute('aria-expanded', 'true');
  renderSourcePanel();
}

function closeSourcePanel() {
  elements.sourcePanel.hidden = true;
  elements.sourceTrigger.setAttribute('aria-expanded', 'false');
}
```

- [ ] **Step 4: 接线开合与 Esc**

在 `elements.wordSearch.addEventListener('input', renderWordbook);` 之前插入：

```js
elements.sourceTrigger.addEventListener('click', () => {
  if (elements.sourcePanel.hidden) openSourcePanel(); else closeSourcePanel();
});
elements.sourceClear.addEventListener('click', () => applySourceSelection(clearSelection(), ''));
document.addEventListener('click', (event) => {
  if (!elements.sourcePanel.hidden && !elements.sourcePanel.contains(event.target) && !elements.sourceTrigger.contains(event.target)) closeSourcePanel();
});
```

把 Esc 处理：

```js
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeContextMenu();
    closeQuestionModal();
  }
});
```

替换为：

```js
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeContextMenu();
    closeQuestionModal();
    closeSourcePanel();
  }
});
```

- [ ] **Step 5: 语法检查**

Run: `node --check public/js/app.js`
Expected: 无输出。

- [ ] **Step 6: 提交**

```bash
git add public/js/app.js
git commit -m "feat(wordbook): 文件夹式来源多选面板"
```

## Task B9: 手工冒烟清单（来源筛选）

**Files:** 无（验证任务）

- [ ] **Step 1: 逐条验证**

启动 `npm start`；先在原文页把几篇文章的词加入单词本（用不同文件夹存放文章），然后进单词本：

1. 默认「来源：全部单词」，列表显示全部单词。
2. 点「来源」按钮：弹出面板，根层有「全部单词」、各文件夹、未归档、未关联文章，且每个都带单词数。
3. 点某个文件夹的勾选框：列表只剩该文件夹的单词；按钮显示文件夹名 +「已选 1 项 · N 个单词」（「项」按用户视角折叠：选满的文件夹算 1 项，其内文章不单独计数）；出现 × 清空按钮。
4. 点该文件夹的 `›` 进去：面包屑显示 `← 全部来源 / 文件夹名`，列出里面**有单词的文章**；勾两篇文章：列表是两篇的并集，勾选框一个全选一个未选，返回根层时该文件夹显示**半选**。
5. 半选状态下再点文件夹勾选框：变成全选（该文件夹所有文章都勾上）。
6. 再点一次：该文件夹清空；若已无其它选择，自动回到「全部单词」。
7. 勾「未关联文章」：只显示没有来源文章的单词（短语等）。
8. 搜索框叠加：输入关键词后，列表是来源筛选与搜索的交集。
9. 点面板外/按 Esc/点完成：面板关闭，筛选保留。
10. 点 × 清空：回到全部单词，列表恢复。
11. 刷新页面：筛选回到「全部单词」（符合设计：不持久化）。
12. 在「我的精读」里把一个文件夹删掉（其中文章保留为未归档）→ 回单词本：这些词出现在「未归档」下。

Expected：12 条全部符合。

## Task B10: 扩展 e2e 断言（可选，需要 Playwright）

**Files:**
- Modify: `test/e2e.py`

- [ ] **Step 1: 改旧断言并加新断言**

把 `assert page.locator("#word-source-filter").count() == 1` 替换为：

```python
        assert page.locator("#word-source-trigger").count() == 1
        assert page.locator("#word-source-panel").is_hidden()
```

在单词本打开后追加：

```python
        page.locator("#word-source-trigger").click()
        assert page.locator("#word-source-panel").is_visible()
        assert page.locator("#word-source-panel .source-row").count() >= 1
        page.keyboard.press("Escape")
        assert page.locator("#word-source-panel").is_hidden()
```

- [ ] **Step 2: 运行（需要 Playwright）**

Run: `npm start`（另开终端）+ `python test/e2e.py`
Expected: 无断言错误；本机未装 Playwright 时以 Task B9 手工清单为准。

- [ ] **Step 3: 提交**

```bash
git add test/e2e.py
git commit -m "test(e2e): 覆盖来源筛选面板开合"
```

---

## 执行记录（2026-10-09 完成）

按 Subagent-Driven 方式执行：每个单元由独立 subagent 实现，随后经规格一致性 + 代码质量两阶段审查（发现的问题由后续 subagent 修复并复验）。

提交（基线 `fbd0a0c` → 最终 `df8fd63`，17 个提交，10 个代码/测试文件 +750/-59 起，含审查修复）：

| commit | 内容 |
| --- | --- |
| `5fa2ce5` | A1 已收录词形判定 |
| `094c22d` | A2 视图返回目标解析 |
| `54de268` | 补齐词形归一化与返回目标的回归覆盖（审查发现的测试缺口） |
| `96334d2` | A3–A6 详情入口、返回关系与已收录状态 |
| `74d54a3` | 统一入库词形并清理审查遗留问题 |
| `40cf447` | A7 已收录反馈样式 + A9 e2e 断言 |
| `427fcbe` `7e1e5e0` `f0d8dec` `4e722c0` | B1–B4 来源选择模型、来源树、命中过滤与三态、按钮文案 |
| `88f05dc` | B5 `filterWords` 交出 `sourceId` |
| `a5a7354` | B6+B7+B8 文件夹式来源多选面板（控件、索引缓存、面板渲染） |
| `c12f520` | e2e 修正失效选择器并覆盖筛选面板 |
| `8ec7c26` | 整体审查的两个阻塞项：详情页来源不被覆盖 + 词形归一化统一 |
| `c1249dd` | `app.js` 剩余手写归一化改走 `wordKey` |
| `fa21cc4` | 来源筛选「项」按用户视角折叠计数 |
| `df8fd63` | 让文件夹折叠与兜底文案的断言真正生效（含变异验证） |

整体审查（fresh eyes 的最终审查 + 修复后复核）发现并修掉的两个阻塞项（都是 DOM 接线层零测试才漏过的）：

- `switchView` 只在「离开详情页」时保护 `state.viewOrigin`，**进入**详情页时仍会覆盖它 → 「我的精读 → 单词本 → 详情 → 返回单词本 → ×」落到原文页。修法：进出详情页都不覆盖来源。
- 详情页按 `item.word === state.detailWord` 精确匹配，而其它地方都归一化；更糟的是 `enrichWordEntry` 展开 AI 回包会**改写条目词形**，生成详细档案后详情页当场显示「没有找到这个单词」。修法：`wordKey()` 唯一归一化入口 + `enrichWordEntry` 保住条目自身词形。

### 已知问题（接受并记录，不阻塞）

1. 进入单词本视图会渲染两次（`switchView` + `renderArticleLibrary` 索引落地后），第二次会重建打开中的筛选面板，理论上会丢键盘焦点；实测此时面板通常尚未打开，暂无用户可见影响。
2. 「选择非空但零命中」：选中的文章后来从单词本消失时，按钮显示兜底文案「文章已不在精读库」，`×` 或「清空来源筛选」可恢复（非死状态）。
3. `elements` 新增字段用 `sourceTrigger` 等命名，与既有 `wordbook*` 前缀不完全一致；未改名以免无谓改动。
4. `test/e2e.py` 新增的详情链路断言需要可用的 `/api/translate`（改动前的 e2e 不需要 Key），已在文件内注明。
5. `public/js/app.js` 已 1300+ 行，建议后续拆分（先抽来源面板那一组函数），但**先补 DOM 层测试再拆**。

执行过程中对计划的修正（文档已同步）：

1. A5 的面板写入点实际是 **6 处**（含 `translateText`），漏改会让选区翻译被残留单词批注覆盖。
2. B6 不能单独落地，必须与 B7、B8 同一个提交完成（否则 `app.js` 顶层引用已移除的 `<select>` 直接抛错）。
3. A9 的 e2e 断言必须用 `expect()` 重试式写法，`count()`/`is_visible()` 会因保存流程是异步而 flaky。
4. e2e 里两个早已失效的选择器 `#word-source-filter`、`.wordbook-item` 一并修正。
5. 点来源筛选的「×」清空时不再顺手关闭面板（外部点击处理器排除 `#word-source-clear`）。

验证方式与结果：

- `node test/*.test.js` 逐文件运行：12 个文件、90 项全部通过（`node --test` 在本沙箱因 `spawn EPERM` 不可用）。
- 行为验证用「仓库外临时目录里的假 DOM 探针」（自建 `document`/`window`/`localStorage`/`indexedDB` 桩，import 真实 `app.js`）：
  - 详情链路探针 8/8 通过，且在修复前的代码上恰好 3 条失败（证明探针能捕获该缺陷）；
  - 来源筛选探针 25/25 通过，并用「把 `index.html` 回退成旧控件」的反向对照复现了初始化 `TypeError`。
- **未验证**：真实浏览器里的布局、滚动恢复、暗色主题与动画观感（本机无 Playwright）；`test/e2e.py` 只做了静态审计与 `ast.parse` 语法校验，未实际运行。

---

## 完成标准

- `node test/wordbook.test.js`、`node test/view-nav.test.js`、`node test/word-sources.test.js` 全部 `fail 0`；其余既有测试文件（用 `Get-ChildItem test\*.test.js` 逐个 `node`）不受影响。
- 第一阶段 Task A8、第二阶段 Task B9 的手工清单逐条通过。
- 两阶段的 spec 行为均有对应实现：详情入口与返回关系、加入动画与已收录标识、来源多层多选与并集命中。
