# 单词详情入口与页面返回关系设计

## 目标

- 原文精读页点词后，已收录的词能一键进入与单词本**完全相同**的整页详情。
- 页面之间的返回关系符合用户实际走过的路径，而不是写死的固定目标。
- 加入单词本有明确反馈动画，并能一眼分辨哪些词已收录、哪些没有。

## 现状与问题

- `renderWordAnnotation`（`public/js/app.js`）只给音标、语境义、按词性分组的义项、最多 3 个短语、1 个例句和「加入单词本 +」；没有掌握度、来源、详细六级档案，也没有进入详情页的入口。
- `renderWordDetail` 是整页详情（`#word-detail-view`），但返回按钮写死「← 返回单词本」并 `switchView('wordbook')`；只有单词本列表能进入。
- `switchView` 对 `word-detail` 特判，任何入口进详情页都会点亮顶部「单词本」。
- `closeDrawer`（单词本右上角 ×）写死「有文章回原文，否则回文章输入页」，忽略真实来源。
- 加入单词本没有反馈，原文页也无法分辨一个词是否已收录。

## 方案

### 1. 入口与来源

统一入口 `openWordDetail(word, origin)`：写入 `state.detailWord` 与 `state.detailOrigin`（`reader` / `wordbook`），再 `switchView('word-detail')`。

- 来源 `wordbook`：单词本列表行（现有行为）。
- 来源 `reader`：批注面板的「查看完整详情 →」。

详情页数据源仍只有 `state.entries`，未收录的词不提供入口（不引入临时词条形态）。

### 2. 返回关系

新增纯模块 `public/js/view-nav.js`，导出 `resolveViewBack({ view, origin, hasArticle })` → `{ view, label }`：

| 当前视图 | 来源 | 返回目标 | 按钮文案 |
| --- | --- | --- | --- |
| `word-detail` | `reader` | `reader` | ← 返回原文 |
| `word-detail` | `wordbook` | `wordbook` | ← 返回单词本 |
| `wordbook` | `reader` | `reader` | ← 返回原文 |
| `wordbook` | `paste` | `paste` | ← 返回文章输入 |
| `wordbook` | `library` | `library` | ← 返回我的精读 |
| `wordbook` | `word-detail` | `word-detail` | ← 返回单词详情 |

无来源时的兜底保持现有行为：`hasArticle ? 'reader' : 'paste'`，文案对应「← 返回原文 / ← 返回文章输入」。

`switchView(view)` 记录 `state.viewOrigin = 进入前的视图`；顶部导航高亮跟随来源所属分区，因此从原文进详情页时不再点亮「单词本」。单词本右上角 × 也改用 `resolveViewBack`。

### 3. 滚动位置

`switchView` 离开视图前把 `window.scrollY` 记入 `state.scrollMemory[view]`，进入视图后在下一帧恢复。从原文页深入详情再返回时不再回到页首。

### 4. 批注面板（原文页右侧）

- 已收录：「已加入单词本 ✓」（`disabled` + `aria-disabled="true"`）+「查看完整详情 →」。
- 未收录：只有「加入单词本 +」；加入成功后按钮变为已收录态，「查看完整详情 →」随即出现。
- 面板在加入、移除、以及从详情页返回原文后，按 `state.entries` 重新渲染，避免显示过期状态。

### 5. 已收录标识与动画

- `public/js/wordbook.js` 新增 `isWordSaved(entries, word)` 与 `savedWordKeys(entries)`，按小写词形比对，与 `addOrUpdateWord` 的键规则一致。
- 面板按钮：`.save-word.is-saving`（按压 + 涟漪）→ `.save-word.is-saved`（✓ 与一次 pop）。
- 本篇重点词卡片：`.key-word-card.is-saved` 与 `.key-word-card-check` 徽标（scale-in 一次），配色与未收录区分。
- 加入成功后统一 `refreshSavedWordUi()`：重渲染面板、重点词卡片、单词本列表，并写状态栏文案。
- 动画只在「未收录 → 已收录」的真实转变时播放；已收录的词重复触发不播放、不重复写入。
- 所有动画在 `@media (prefers-reduced-motion: reduce)` 下退化为纯状态变化，沿用 `.archive-spinner` 的现有做法。

### 6. 详情页

- 掌握度、来源、详细六级档案、生成详细档案、移除等保持现状不变。
- 「从单词本移除」后回到 `detailOrigin` 对应视图并刷新原文页面板与重点词卡片，不再停在「没有找到这个单词」。

## 测试

- `test/wordbook.test.js`：`isWordSaved` / `savedWordKeys` 的大小写比对与未收录判定。
- 新增 `test/view-nav.test.js`：`resolveViewBack` 的六条路径与无来源兜底。
- DOM 行为（面板按钮状态、动画、滚动恢复、导航高亮）通过扩展 `test/e2e.py` 覆盖；本机未安装 Playwright，运行方式在实现计划中说明。

## 范围与约束

- 不做浏览器地址栏前进/后退：应用没有路由，加 hash 路由需要改动所有视图切换。
- 不做未收录词的临时详情页形态。
- 不把完整详情塞进窄面板。
- 面板的快速释义仍来自预研读缓存或查询接口，可能与已收录词条的档案释义不同（语境义 vs 档案义），保持现状。
