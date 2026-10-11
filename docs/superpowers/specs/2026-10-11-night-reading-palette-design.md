# 夜间阅读纸面配色设计（中性暗）

## 目标

夜间模式下把「纸张页面」也改成暗色，长文阅读不刺眼。亮色主题**渲染完全不变**。

## 现状与问题

暗色主题原来是**故意**留一张亮纸的：`html[data-theme="dark"] .reader-paper { background: rgba(233,224,207,.94); color: #26342f; }`，配套的批注卡片 `#d8d1c2`、段译文块 `rgba(174,207,194,.76)`、小记块 `rgba(238,222,160,.72)` 也都是浅色——效果是「夜里开着台灯看书」。用户实测认为长文夜里刺眼，要求纸也变暗。

顺带查出两个同页缺陷：

1. **已收录单词的高亮**是 `linear-gradient(transparent 54%, rgba(236,214,110,.92) 54%)`：不透明亮黄条，纸变暗后浅色文字压在亮黄上会几乎看不清。
2. **划选操作条** `.selection-actions` 是 `color:#f8f3e6` + `background: var(--ink)`；暗色的 `--ink` 是浅色（`#e8e0cf`）→ **浅底浅字**，暗色下基本不可读。

## 参考

- [Readwise Reader 的 Appearance](https://docs.readwise.io/reader/docs/faqs/appearance)：把「阅读主题」（纸色/字色/高亮色）与应用外观分开，提供 Crisp/Sepia/Soft/Slate/Ink/Night 六套，**每套都有亮色与暗色两个版本**，Night 则永远深色。本次沿用这个思路：为纸面单独引入一套暗色变量，而不是让纸继续沿用亮色。
- [暗色模式的常见设计失误](https://www.theskinsfactory.com/uiux-design-blog/why-your-dark-mode-looks-bad-ui-ux-guide)：避免纯黑＋纯白带来的光晕疲劳。
- [Kindle 夜间模式](https://www.amazon.com.br/gp/help/customer/display.html?nodeId=TZRTRCyYYbxMsMHDu8)：深灰而非纯黑。

## 方案：中性暗（用户选定）

在 `html[data-theme="dark"]` 里新增一组只被暗色规则引用的变量（亮色主题一处都不引用，因此亮色渲染不受影响）：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--sheet` | `#1b1b1b` | 正文那张纸 |
| `--sheet-ink` | `#d8d5ce` | 纸上的正文 |
| `--sheet-soft` | `#9c9c97` | 纸上的次要文字（页眉页脚、段落编号、「小记」按钮） |
| `--sheet-line` | `rgba(255,255,255,.12)` | 纸上的分隔线 |
| `--sheet-shadow` | `rgba(0,0,0,.45)` | 纸的投影（原来是浅色投影） |
| `--panel` | `#232323` | 批注卡片 / 长按菜单 / 划选操作条 |
| `--panel-raised` | `rgba(255,255,255,.06)` | 卡片内的块（译文、例句） |
| `--tint-green` | `rgba(127,209,185,.12)` | 段译文块底色 |
| `--tint-marker` | `rgba(255,214,102,.10)` | 小记块底色 |
| `--highlight` | `rgba(255,214,102,.22)` | 已收录词 / 悬停高亮（半透明叠色，文字保持浅色） |

层次：桌面 `--paper #16221f` → 书封 `--paper-deep #1e302a`（沿用基础规则，不新增色相）→ 纸页 `#1b1b1b`。三层同色系，避免色相断口。

强调色沿用现有 `--green #72bba7` / `--green-dark #b3dfd0`（与备选方案的 `#7FD1B9` 属同一薄荷色系，差异肉眼难辨），不为了纸面去改全站强调色。

## 改动的规则（全部在暗色作用域内）

- `reader-paper`：纸与正文色。
- `book-shell`：边框与投影（底色仍用基础规则的 `var(--paper-deep)`）。
- `book-page-header/footer`、`paragraph-number`、`paragraph-note-toggle`：次要文字色。
- `paragraph-note-input`：输入文字色与虚线。
- `word-token:hover/:focus-visible`、`word-token.is-highlighted`：改为 `--highlight` 半透明叠色。
- `inline-translation`、`paragraph-note`：改用 tint 变量（原来那两条把纸当浅色、硬写深色文字的规则已删除）。
- `annotation-panel`：改为 `--panel` 深色卡片；**同时删掉**两条把卡片内文字压成深色的规则（`#3f5148`、`#075e50`），因为基础规则本就用 `var(--green-dark)`/`var(--ink-soft)`，暗色下自然是浅色。
- `annotation-translation`、`example-card`：`--panel-raised`。
- `frequency`：`#926c1c` → `#d9b45f`（暗底上原来的深金太暗）。
- `word-context-menu`：深色卡片 + 悬停改为白色微亮（原来悬停是琥珀条，配浅字对比不足）。
- `selection-actions`：修掉浅底浅字（见上文缺陷 2）。
- `sheet-close` / `sheet-status` / 卡片把手 `::before`：跟上暗色卡片。

## 不做的事

- 不动字号、行距、字体、排版（截图里正文排版本身没问题）。
- 不动亮色主题、不动单词本/我的精读等其它页面的暗色规则（本次只处理阅读页及其覆盖层）。
- 不改全站强调色 `--green`。

## 测试与验证

- `node --check` 不适用（CSS）；用脚本校验花括号平衡、新变量「定义一次、引用齐备」，`node --test --test-isolation=none` 保持 150 个测试全绿。
- **真机验证清单**：夜间模式下 ① 正文纸是深的、字清楚；② 已收录词的高亮是半透明琥珀、字仍看得清；③ 点词卡片是深色卡片、卡内译文/例句块与卡片有层次；④ 展开段译文与小记块是暗色；⑤ 长按菜单与划选操作条清晰可读（后者原先几乎看不见）；⑥ 切成日间模式后与改前完全一致。
