// 「我的精读」的类型与文件夹筛选：纯函数，供 app.js 渲染使用。
export function listCategories(articles) {
  const counts = new Map();
  for (const article of Array.isArray(articles) ? articles : []) {
    const name = String(article?.category ?? '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));
}

export function filterArticles(articles, { folderId = 'all', category = 'all' } = {}) {
  return (Array.isArray(articles) ? articles : []).filter((article) => {
    const folderMatches = folderId === 'all' || String(article?.folderId ?? '') === folderId;
    const categoryMatches = category === 'all' || String(article?.category ?? '').trim() === category;
    return folderMatches && categoryMatches;
  });
}

// 重名判定忽略大小写与首尾空白。
export function validateFolderName(name, folders) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { ok: false, message: '请输入文件夹名称。' };
  const duplicated = (Array.isArray(folders) ? folders : [])
    .some((folder) => String(folder?.name ?? '').trim().toLowerCase() === trimmed.toLowerCase());
  return duplicated ? { ok: false, message: `已有同名文件夹“${trimmed}”。` } : { ok: true, message: '' };
}
