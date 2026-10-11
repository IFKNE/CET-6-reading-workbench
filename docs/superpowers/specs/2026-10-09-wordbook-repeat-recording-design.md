# 单词跨文章重复收录设计

## 目标

同一个词在不同文章里出现时，在**任意一篇**都能再次「加入单词本」，且：

- 不重复建条目（一个词形只有一条记录）；
- 该篇的出现次数与原句被累积进去，之前文章的次数与原句不丢。

## 现状与问题

1. `renderAnnotationActions`（`public/js/app.js`）对已收录的词渲染 **disabled** 的「已加入单词本 ✓」，所以在别的文章里根本点不了 —— 用户报的「单词无法重复记录」就是它。
2. `addOrUpdateWord`（`public/js/wordbook.js`）用 `{ ...existing, ...entry }` 合并，新一篇的 `context`（原句）会**覆盖**旧句；`sources[articleId]` 只存 `title / count / recordedAt`，**不存句子**，所以每篇的原句无法累积。

## 方案

### 1. 数据层（`public/js/wordbook.js`）

- `addOrUpdateWord` 的 `sources[articleId]` 增加 `sentences: string[]`：收录时把该篇原句（`entry.context`）去重追加；同篇重记不产生重复句，`count` 用最新统计值刷新，`title` 缺失时沿用旧值。
- 新增纯函数 `findWordEntry(entries, word)`（按 `wordKey` 查找条目），`isWordSaved` 改为委托它。
- 新增纯函数 `collectWordSources(entry)` → `[{ articleId, title, count, sentences }]`，按 `count` 降序、`title` 升序；过滤空句。详情页与导出共用。
- `createMarkdown` 每篇来源下面列出该篇累积的原句（无句子的旧条目行为不变）。

旧条目没有 `sentences` 字段：读取时按空数组处理，从某篇重记时自然补上。

### 2. 批注面板按钮（`public/js/app.js`）

按「词是否在册」+「**本篇**是否记过」分三态（本篇 = `state.articleId`，为空表示这篇还没入库）：

| 状态 | 按钮 | 其它 |
| --- | --- | --- |
| 未收录 | 「加入单词本 +」（可用） | 成功后变为下面两态之一 |
| 已收录、本篇未记过 | 「**本篇再记一次 +**」（可用） | 上方一行小字「已在册 · 共 N 篇来源」；点击后累加本篇次数与原句、播放入动画；下方「查看完整详情 →」 |
| 已收录、本篇已记过 | 「**本篇已记录 ✓ · N 次**」（禁用、`aria-disabled`） | 同样有「已在册 · 共 N 篇来源」与「查看完整详情 →」 |

「N 次」= 该篇全文出现次数（`countWordInArticle`）。同一篇不重复点（用户已确认 A 案）。

### 3. 单词本详情页（`public/js/app.js`）

「来源与掌握度」由一行文本改为：

- 首行 `共 N 篇来源 · 出现 M 次`（M = 各篇次数之和）；
- 每篇一段：`标题 · N 次`，其下按行列出该篇累积的原句（旧条目无句子时只显示次数）。

### 4. 导出（`createMarkdown`）

每篇来源下追加该篇的原句（`> 句子`），保持现有「- 来源：标题（N 次）」行不变。

## 测试

- `test/wordbook.test.js`：跨篇累积（两篇各自的 `count` 与 `sentences`）、同篇重记不重复句且刷新次数、旧条目无 `sentences` 的兼容、`findWordEntry` 的大小写/空白、`collectWordSources` 的排序与空句过滤、`createMarkdown` 含每篇句子。
- DOM 行为（按钮三态、来源块渲染）由仓库外假 DOM 探针覆盖：新增/改写 `reader-save-detail` 场景，断言「另一篇文章里按钮是『本篇再记一次』且可点」「点击后条目仍只有 1 条、sources 增加本篇、sentences 累积」「同篇再次点击按钮为禁用态且显示次数」。

## 范围与约束

- 一个词形仍然只有一条条目；不做同词多条目。
- 每篇的次数是该篇全文出现次数，不做全局累加字段（详情页按需求和显示）。
- 面板按钮的三态只依据「在册 / 本篇是否记过」，不依据掌握度或标签。
- 不改单词本的筛选、排序与搜索行为。
