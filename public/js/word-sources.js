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
