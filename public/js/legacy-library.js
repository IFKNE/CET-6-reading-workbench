// 仅供一次性迁移使用：只从这里导入 listLegacyArticles / listLegacyFolders / readLegacyWordbook。
// 下面的 getArticle / saveArticle / deleteArticle / createFolder / deleteFolder 是旧的 IndexedDB 实现，
// 与 article-library.js 同名但来源不同，别再使用。
const databaseName = 'cet6-reading-library';
const databaseVersion = 2;
const articleStoreName = 'articles';
const folderStoreName = 'folders';

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('当前浏览器不支持本地文章库。'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(new Error('无法打开本地文章库。'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(articleStoreName)) {
        const store = database.createObjectStore(articleStoreName, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!database.objectStoreNames.contains(folderStoreName)) {
        const store = database.createObjectStore(folderStoreName, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runTransaction(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onerror = () => reject(new Error('本地文章库操作失败。'));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(new Error('本地文章库操作失败。'));
  });
}

export async function listLegacyArticles() {
  const records = await runTransaction(articleStoreName, 'readonly', (store) => store.getAll());
  return records.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export function getArticle(id) {
  return runTransaction(articleStoreName, 'readonly', (store) => store.get(id));
}

export function saveArticle(record) {
  return runTransaction(articleStoreName, 'readwrite', (store) => store.put(record));
}

export function deleteArticle(id) {
  return runTransaction(articleStoreName, 'readwrite', (store) => store.delete(id));
}

export async function listLegacyFolders() {
  const records = await runTransaction(folderStoreName, 'readonly', (store) => store.getAll());
  return records.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

export function createFolder(name) {
  const folder = { id: createId('folder'), name: String(name).trim(), createdAt: new Date().toISOString() };
  return runTransaction(folderStoreName, 'readwrite', (store) => store.put(folder));
}

export function deleteFolder(id) {
  return runTransaction(folderStoreName, 'readwrite', (store) => store.delete(id));
}

const legacyWordbookKey = 'cet6:wordbook';

// 旧版本把单词本存在 localStorage 里，迁移时读一次就够了。
export function readLegacyWordbook() {
  try {
    const data = JSON.parse(localStorage.getItem(legacyWordbookKey) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
