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
