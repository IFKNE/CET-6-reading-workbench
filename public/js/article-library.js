import { deleteArticle as deleteArticleRemote, deleteFolder as deleteFolderRemote, fetchLibrary, putArticle, putFolder } from './library-api.js';

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 契约与旧 IndexedDB 版本完全一致，所以 app.js 的调用点不用改：
// 文章按 updatedAt 降序、文件夹按 createdAt 升序、getArticle 未命中 resolve undefined、
// createFolder 解析出新文件夹 id、saveArticle 解析出落库后的记录。
export async function listArticles() {
  const { articles } = await fetchLibrary();
  return [...articles].sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
}

export async function getArticle(id) {
  const { articles } = await fetchLibrary();
  return articles.find((record) => record.id === id);
}

export async function saveArticle(record) {
  const { article } = await putArticle(record);
  return article;
}

export async function deleteArticle(id) {
  await deleteArticleRemote(id);
}

export async function listFolders() {
  const { folders } = await fetchLibrary();
  return [...folders].sort((left, right) => String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')));
}

export async function createFolder(name) {
  const folder = { id: createId('folder'), name: String(name).trim(), createdAt: new Date().toISOString() };
  await putFolder(folder);
  // 只返回 id：app.js 用 `typeof created === 'string'` 分支处理，契约与 IDB 版一致。
  return folder.id;
}

export async function deleteFolder(id) {
  await deleteFolderRemote(id);
}
