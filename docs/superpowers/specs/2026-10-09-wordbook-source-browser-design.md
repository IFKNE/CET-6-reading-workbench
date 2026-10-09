# 单词本来源筛选（文件夹式多层多选）设计

## 目标

单词本的来源筛选从平铺下拉改成「像打开文件夹一样」的多层多选：文件夹 → 文章可以逐层进入、勾选，单词列表始终可见，默认仍然显示全部单词。

## 现状与问题

- 单词本来源筛选是 `#word-source-filter` 一个平铺 `<select>`，只列文章标题，只能单选一篇。
- 单词条目的来源是 `entry.sources[articleId] = { title, count, recordedAt }`（localStorage `cet6:wordbook`），**不含文件夹信息**。
- 文件夹与文章在 IndexedDB `cet6-reading-library`：`folders` 是扁平 `{ id, name, createdAt }`，`articles` 带 `folderId`。单词本渲染时没有关联这两份数据，所以无法按文件夹归类。

## 方案

### 1. 选择模型

状态里保存 `selection = { all: boolean, articleIds: Set<string>, includeUnlinked: boolean }`：

- `all: true` → 全部单词（默认）。
- `articleIds` → 命中的文章集合，可来自逐个勾选文章，也可来自勾选文件夹批量加入。
- `includeUnlinked: true` → 额外包含「未关联文章」的单词。

勾选规则：

- 勾文件夹 = 批量勾选/取消该文件夹下所有「有单词的文章」；文件夹本身不是独立过滤条件。
- 文件夹勾选框三态：全选 / **半选**（`input.indeterminate`）/ 未选；半选时点一下 = 全选，再点 = 清空。
- 勾「全部单词」清空其它选择；勾任何具体项自动取消 `all`。
- 「未归档」与「未关联文章」同样可勾。

命中规则（并集、不重复）：

```
all                    → 全部单词
否则                   → entry.sources 命中任一 articleIds 的文章
                        ∪（includeUnlinked 且该词没有任何 sources）
```

一个词在多篇文章出现过时，命中任一篇即显示一次。

两条由选择模型决定的行为：

- **`all` 状态下的勾选 = 只看这一项**：`all` 为真时所有文件夹显示为已勾（它们的词确实都在显示中），此时点某个文件夹/文章/未关联文章，结果是「只看这一项」并进入显式多选，而不是从全部里排除它（本项目不做排除模型）。点「全部单词」回到全部。
- **取消最后一个选择 = 回到「全部单词」**：不允许出现「一项都没选」的空选择状态，避免筛选后面板空转。

### 2. 归属规则（每个单词恰好一条路径）

- **各文件夹**：文章 `folderId === 文件夹 id`。
- **未归档**：文章没有文件夹，**或**文章已从精读库删除（`entry.sources` 里还留着标题，但库里查不到该 id）。
- **未关联文章**：条目没有任何 `sources`（短语、以及在未保存文章里查到的词）。
- 文件夹层只列**确实有单词的文章**并显示单词数；没有单词的文件夹与文章不显示（单词本是单词列表，空文件夹在那里没有意义）。

### 3. 弹出面板（交互）

- 触发控件是按钮「来源：全部单词 ▾」（替换现有 `<select>`），带 `aria-expanded`、`aria-haspopup`。
- 面板复用现有 `#word-context-menu` 的绝对定位模式：
  - **根层**：`全部单词` / 各文件夹（三态勾选 + 进入箭头）/ `未归档 (n)`（三态 + 进入箭头）/ `未关联文章`。
  - **文件夹层**：面包屑 `全部来源 / 听力原文` + 返回上一层，列出该文件夹内有单词的文章（真实 `<input type="checkbox">` + 单词数），以及「本文件夹全选 / 全不选」。
  - **底部**：`清空来源筛选` 与 `完成`。
- 勾选**即时生效**（背后列表实时变化），面板保持打开；点面板外、按 Esc、点「完成」关闭；点「×」清空筛选时面板也保持打开（只有前三种才关闭）。
- 行按「有没有单词」过滤：没有单词的文件夹、没有单词的文章、计数为 0 的 `未归档` 与 `未关联文章` 都不显示（单词本是单词列表，空项在那里没有意义）。
- 面板限高并可滚动，适配窄列。

### 4. 触发按钮文案

- 未筛选：`来源：全部单词`。
- 单选一项：`来源：听力原文` 或 `来源：Conversation One`。
- 多项：`来源：听力原文 +2 项`。
- `项` 按用户视角折叠计数：**选满的文件夹算 1 项**（名字用文件夹名），其内文章不再单独计数；未被选满文件夹覆盖的文章各算 1 项；`未关联文章` 算 1 项。因此勾一个含 2 篇文章的文件夹显示「已选 1 项」，勾两个文件夹显示「文件夹A +1 项」。
- 有筛选时显示副标签 `已选 N 项 · M 个单词`（M = 命中来源的子集大小，与搜索词、状态筛选无关），并提供 `×` 一键清空。
- 选中的文章后来从单词本消失（该篇的单词全被移除）时，按钮显示兜底文案 `文章已不在精读库`，`×` 或「清空来源筛选」即可恢复。

### 5. 数据同步

- `state.libraryIndex = { articles: Map<id, { title, folderId }>, folders: [{ id, name }] }`，由 `listArticles()` + `listFolders()` 填充。
- 刷新时机：开机、进入单词本视图、保存文章、删除文章、修改文章文件夹、新建/删除文件夹、改文章元数据。
- `renderWordbook()` 保持同步函数，只读缓存索引，避免把大量调用点改成异步。
- 选择保存在 `state.sourceSelection`，重渲染不丢失。

### 6. 模块与测试

- 新增 `public/js/word-sources.js`（纯函数，无 DOM）：
  - `createSourceTree(entries, articles, folders)` → `{ folders: [{ id, name, articleIds, articles: [{ id, title, count }], count }], unfiled: { articleIds, articles, count }, unlinked: { count }, total }`
  - 选择模型：`selectAll()` / `clearSelection()` / `toggleArticle(selection, articleId)` / `toggleFolder(selection, tree, folderId)` / `toggleUnfiled(selection, tree)` / `toggleUnlinked(selection)`
  - `groupCheckState(articleIds, selection)` → `'all' | 'some' | 'none'`（文件夹、未归档、文章行共用）
  - `filterEntriesBySource(entries, selection)`
  - `describeSelection(selection, tree, entries)` → `{ label, detail, active }`
- `public/js/wordbook.js` 的 `filterWords` 只保留搜索词、状态与标签筛选（搜索词仍按现有行为匹配单词、释义与来源文章标题）；来源筛选由 `filterEntriesBySource` 先行完成（`filterWords` 的 `sourceId` 选项移除，对应测试改写为同样的语义）。
- `node --test` 覆盖：归属唯一性（每个条目恰好落在一条路径）、未归档与未关联分支、文章被删、文件夹被删后单词归位、多来源词的并集去重、文件夹三态、与搜索/状态/标签筛选取交集、`describeSelection` 各分支文案。

## 范围与约束

- 不做文件夹嵌套（用户选择 A：文件夹 → 文章两层）。
- 不把单词列表改成逐层页面：列表始终显示，只被筛选。
- 不改「我的精读」的文件夹界面与数据结构。
- 来源筛选不持久化（与现有筛选一致，刷新后回到全部单词）。
- 单词本数据仍只有 localStorage 一份；精读库索引只是渲染期的关联缓存，缺索引时降级为「全部单词 + 未关联文章」。
