// 单词本来源筛选：选择模型、来源树、命中过滤与文案，全部为纯函数。
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

function findArticle(tree, articleId) {
  const pools = [...(tree?.folders ?? []).flatMap((folder) => folder.articles ?? []), ...(tree?.unfiled?.articles ?? [])];
  return pools.find((article) => article.id === articleId);
}

// 防御性兜底：当前调用路径下树与 entries 同源，能进树的文章必然在 entries 里，
// 因此正常永远查不到这里；只有拿旧快照（或不同一批数据）构建的树配新 entries 时才可能命中。
function findStoredTitle(entries, articleId) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    const title = entry?.sources?.[articleId]?.title;
    if (title) return String(title);
  }
  return '';
}

// 文章单词被删光后就不在来源树里了，但精读库本身还在，用库里的标题补上。
function findLibraryTitle(articles, articleId) {
  const matched = (Array.isArray(articles) ? articles : []).find((article) => String(article?.id ?? '') === articleId);
  return matched?.title ? String(matched.title) : '';
}

function articleTitle(tree, entries, articles, articleId) {
  return findArticle(tree, articleId)?.title
    || findLibraryTitle(articles, articleId)
    || findStoredTitle(entries, articleId)
    || '文章已不在精读库';
}

// 侧栏「项」按用户视角折叠：选满的文件夹算一项，其内文章不再单独计数。
export function describeSelection(selection, tree, entries, articles = []) {
  if (!selection || selection.all) return { label: '全部单词', detail: '', active: false };
  const articleIds = (selection.articleIds ?? []).map(String);
  const includeUnlinked = Boolean(selection.includeUnlinked);
  const folders = tree?.folders ?? [];
  const selectedFolderIds = new Set(articleIds);
  const fullFolders = folders.filter((folder) => (
    folder.articleIds.length > 0 &&
    folder.articleIds.every((id) => selectedFolderIds.has(id))
  ));
  const covered = new Set(fullFolders.flatMap((folder) => folder.articleIds));
  const names = [
    ...fullFolders.map((folder) => folder.name),
    ...articleIds.filter((id) => !covered.has(id)).map((id) => articleTitle(tree, entries, articles, id))
  ];
  if (includeUnlinked) names.push('未关联文章');
  const label = names.length === 1 ? names[0] : names.length ? `${names[0]} +${names.length - 1} 项` : '全部单词';
  const wordCount = filterEntriesBySource(entries, selection).length;
  return { label, detail: `已选 ${names.length} 项 · ${wordCount} 个单词`, active: true };
}
