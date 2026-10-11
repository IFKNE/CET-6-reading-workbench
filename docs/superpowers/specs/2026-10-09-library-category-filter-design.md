# 我的精读：类型筛选与新建文件夹改进设计

## 目标

1. 「我的精读」可以按**文章类型**（`category`）筛选，与文件夹筛选叠加。
2. 新建文件夹的交互更合理：有明确反馈、不打断当前筛选。

## 现状与问题

- `renderFolderShelf`（`public/js/app.js`）只提供文件夹单选 chips（`state.libraryFolderId`）；文章 `category` 只在卡片上显示成标签（`article-category-tag`），**不参与筛选**。
- 新建文件夹（`#new-folder-name` + `#create-folder`）：
  - 名称为空或重名时只**静默** `focus()` / `select()`，没有任何提示；
  - 创建成功后把 `state.libraryFolderId` 切到刚建的空文件夹，于是**当前列表被清空**；
  - 只能点按钮，回车无效；输入为空时按钮仍可点；
  - 占位文案用「长篇阅读」举例，而它正好是分类名，和类型筛选混在一起容易误解。

## 方案

### 1. 类型筛选

- 在文件夹 chips **上方**新增一行 chips：`全部类型` + 文章里实际出现的每个 `category`（含自定义分类），各带**全局篇数**；**单选**，默认 `all`。
- 篇数取**全局**（不随文件夹变化），避免数字跳动；篇数为 0 的 chip 置灰不可点。
- 新增 `state.libraryCategory = 'all'`；筛选语义为交集：先按文件夹、再按类型。
- 复位：点「全部类型」只清类型；点「全部文章」只清文件夹。
- 空列表提示分三种：
  - 没有任何文章 → 「还没有保存的精读文章。」
  - 文件夹 + 类型都限定了 → 「这个文件夹里没有“X”类型的文章。」
  - 只限定了类型 → 「没有“X”类型的文章。」
  - 只限定了文件夹 → 「这个文件夹里还没有文章。」
- 文件夹 chips 同时补上篇数（`全部文章 / 未归档 / 各文件夹`），两行风格一致。

### 2. 新建文件夹

- **回车提交**；输入为空（或纯空白）时按钮 `disabled`。
- 空名/重名给明确提示（新增 `#folder-message`，`role="alert"`，复用 `.form-message` 样式）：「请输入文件夹名称。」／「已有同名文件夹“X”。」；重名判定**忽略大小写与首尾空白**。
- 创建成功后：
  - **不改变当前筛选**（`state.libraryFolderId` 不动，列表不会突然变空）；
  - 提示「已创建文件夹“X”。」（成功样式）；
  - 新文件夹 chip 闪一下（`state.libraryNewFolderId` 一次性标记 + CSS 动画）；
  - 它仍成为「存入文件夹」下拉的默认目标（保留现有 `state.folderId = folder.id` 行为）；
  - 输入框清空并保持聚焦，方便连续创建。
- 占位文案改成「新建文件夹名称，例如：真题听力」，不再用分类名举例。
- 输入变化时清掉上一次的提示。

### 3. 结构

- 新增纯模块 `public/js/library-filter.js`：
  - `listCategories(articles)` → `[{ name, count }]`，按篇数降序、名称升序，忽略空分类；
  - `filterArticles(articles, { folderId, category })` → 交集过滤（`'all'` 表示不限）；
  - `validateFolderName(name, folders)` → `{ ok, message }`。
- `public/index.html`：`#folder-shelf` 之前加 `#category-shelf`（`class="folder-shelf"` 复用样式）；`#folder-create-row` 之后加 `<p id="folder-message" class="form-message" role="alert"></p>`；占位文案更新。
- `public/js/app.js`：`renderCategoryShelf(articles)`、`renderFolderShelf` 补篇数与新 chip 闪烁、`createFolderFromInput()`、`setFolderMessage()`、`state.libraryCategory` / `state.libraryNewFolderId`。
- `public/styles.css`：`.form-message.is-success`、`.folder-chip button.is-new` 动画（遵守 `prefers-reduced-motion`）。

## 测试

- `test/library-filter.test.js`：
  - `listCategories`：去重计数、排序、忽略空/空白分类、自定义分类、非数组输入；
  - `filterArticles`：四组合（不限/仅文件夹/仅类型/两者）、`'all'` 语义、`folderId` 为 `''`（未归档）、缺字段文章；
  - `validateFolderName`：空、纯空白、重名（忽略大小写与首尾空白）、正常。
- DOM 行为由仓库外假 DOM 探针覆盖，新增场景 `library-category-filter`：种入多篇不同 `category` 的文章 → 断言类型 chips 与全局篇数 → 点某类型后列表只剩该类 → 叠加文件夹后取交集 → 新建文件夹（回车提交、重名提示、创建后**当前筛选不变**、新 chip 带 `is-new`）。

## 范围与约束

- 不做类型多选；不做文章标题搜索（后续如需再单独做）。
- 类型值取 `record.category` 原样，不做归一化。
- 不改单词本页面的来源筛选（它按文章/文件夹聚合，与文章分类无关）。
- 不改变「删除文件夹 → 其中文章变为未归档」的既有行为。
