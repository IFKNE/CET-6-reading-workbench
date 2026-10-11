# 手机端阅读页：点词查义改为底部卡片设计

## 目标

手机（≤900px）上点单词／选中文字后，**释义立刻出现在视线附近**，不再渲染在几千像素之外的文末。桌面端（≥901px）的右侧粘性批注栏**一行都不改**。

## 现状与问题（来自真机截图 + 代码定位）

用户在 Android Chrome 上截图确认：正文排版本身没问题，坏的是「点词 → 看释义」这条链路。

- `elements.readerContent` 的 click 委托（`public/js/app.js:1441`）→ `lookupWord()` → 内容写进 `#annotation-panel`（`app.js:266`）。
- `#annotation-panel` 是 `.reading-layout` 的第二个网格项，排在 `article.book-shell` **之后**（`public/index.html:72` vs `:78`）；≤900px 时 `.reading-layout` 塌成单列（`public/styles.css:293`），于是面板落在**整篇文章之后**，而文章前面还有整个重点词区（`public/index.html:70` 在 `.reading-layout` 之前）。
- `public/js/app.js` 全文没有任何 `scrollIntoView`，所以点词后**屏幕上什么都不会发生**——释义其实已经算好了。

同时确认两处同页问题：

1. ≤560px 时 `.reader-toolbar p { display: none }`（`public/styles.css:308`），而 `#reader-status` 承载「已加入单词本」「翻译失败」「未连接到电脑服务器」等反馈 → 手机上完全看不到。
2. `.word-token` 是 `padding: 0` 的行内按钮（`public/styles.css:132`），触控热区只有文字本身，手指容易点偏到相邻词。

## 方案：手机端底部卡片（桌面端不动）

参考 Readwise Reader / 微信读书 / 欧路词典的查词卡片：从底部滑出、内容可滚、有把手与「收起」、点正文空白处关闭。

### 1. 卡片本体（纯 CSS，仅 ≤900px）

`#annotation-panel` 在窄屏变为固定定位的底部抽屉：

- `position: fixed; left: 0; right: 0; bottom: 0; z-index: 26;`
- `max-height: 62vh; overflow-y: auto; overscroll-behavior: contain;`
- `border-radius: 16px 16px 0 0;`
- `padding-bottom: calc(20px + env(safe-area-inset-bottom));`
- 关闭态 `transform: translateY(105%); visibility: hidden;`，打开态（`.is-open`）`translateY(0); visibility: visible;`，`transition: transform .28s ease;`
- 打开时给顶部一个把手（`::before` 画一条 36×4 的圆角条），不再需要额外的 DOM。
- 尊重 `prefers-reduced-motion`：该媒体查询下取消 transition（仓库既有约定，见 `styles.css:175/266/319`）。

**不引入 `viewport-fit=cover`**：它会让内容伸到刘海下面，需要同时给顶部做安全区适配，超出本次范围。`env(safe-area-inset-bottom)` 在没有该 meta 时通常为 0，写了也不会坏事；Android Chrome 上本来就没有底部安全区。

### 2. 开关是显式的，不能靠「有 annotation 才开」

`showLoading()`（`app.js:527`）与 `showError()`（`app.js:536`）都调用 `setAnnotationContent([...])` 且**不传 annotation**（默认 `null`）。若用「annotation 非空才打开」作为条件，点词后到译文返回前卡片不会出现——那正是本次要修的「点了没反应」。

因此：

- `setAnnotationContent()` 每次写完内容后调用 `openAnnotationSheet()`（桌面端为空操作，只是加一个类）。
- `resetAnnotation()`（`app.js:269`，唯一「无内容」的写入点）在写入后调用 `closeAnnotationSheet()`。
- `closeAnnotationSheet()` 同时用于「收起」按钮、点正文空白处、`Esc`、以及离开阅读页（`switchView`）。

### 3. 卡片内的把手与「收起」按钮

`setAnnotationContent()` 是面板内容的唯一写入点（`app.js:264`），在这里把一段 chrome 前置进 `replaceChildren(chrome, ...content)`：

```js
function createSheetChrome() {
  const chrome = createElement('div', 'sheet-chrome');
  const close = createElement('button', 'sheet-close', '收起');
  close.type = 'button';
  close.addEventListener('click', () => closeAnnotationSheet());
  chrome.append(close);
  return chrome;
}
```

桌面端 `.sheet-chrome { display: none }`；窄屏显示为卡片顶部的粘性一行（`position: sticky; top: 0`），按钮保持至少 44×44 的触控面积。

### 4. 反馈也显示在卡片里

`#reader-status` 在 ≤560px 被隐藏。做法：模块级创建**一个**状态节点 `sheetStatus`，放进 chrome，并让 `setReaderStatus()` 同时写它：

```js
function setReaderStatus(message) {
  elements.readerStatus.textContent = message;
  if (sheetStatus) sheetStatus.textContent = message;
}
```

节点只创建一次、每次渲染时被移进 chrome，因此文案不会因为重渲染而丢失。（`resetAnnotation` 之后卡片收起，看不到也无所谓。）

### 5. 点正文空白处关闭

沿用仓库既有做法（`app.js:1433` 的来源面板处理器）：用 `event.composedPath()` 判断，路径里包含面板或包含 `.word-token` 就**不**关闭——否则点词会先打开、再被同一次点击立刻关掉。

### 6. 触控热区（同页）

≤900px 给词元加内边距与触控优化，用负外边距抵消掉对文字排版的影响：

```css
@media (max-width: 900px) {
  .word-token { padding: 3px 1px; margin: 0 -1px; touch-action: manipulation; }
}
```

行高是 1.95（`styles.css:119`），纵向有富余空间，不会挤压行距。

## 影响面与不做的事

- 桌面端（≥901px）零改动：所有新规则都在 `@media (max-width: 900px)` 内，chrome 在桌面端 `display: none`。
- 不改 `.selection-actions`（`styles.css:178`）：点击「翻译选中内容」后卡片会盖住它，正是期望行为；卡片关闭时它照旧可用。
- 不改顶部工具栏布局、不改重点词区顺序、不改 `.word-context-menu`（长按菜单）——本次只解决「点词看不到释义」。
- 不动 `#reader-status` 在 ≤560px 的隐藏规则（改为在卡片里镜像反馈，这是用户选定的方式）。

## 测试

- 仓库没有 DOM 测试环境，`app.js` 无自动化覆盖（既有事实）。本次验证方式：
  1. `node --check public/js/app.js`；
  2. `node --test --test-isolation=none` 保持 150 个测试全绿（本次不改后端与纯模块）；
  3. **真机验证清单**（交由用户在手机上确认）：点词→卡片滑出且显示释义；卡片内「加入单词本」→ 反馈文字出现在卡片里；点正文空白→卡片收起；「收起」按钮→收起；选中一段→「翻译选中内容」→ 卡片显示译文；桌面浏览器右侧栏行为不变。
