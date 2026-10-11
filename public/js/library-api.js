const jsonHeaders = { 'Content-Type': 'application/json' };

const listeners = new Set();
let online = true;

// 服务器在线状态：任何请求都能翻转它，界面据此显示/隐藏“未连接”提示条。
export function subscribeServerStatus(handler) {
  listeners.add(handler);
  handler(online);
  return () => listeners.delete(handler);
}

function setOnline(next) {
  if (next === online) return;
  online = next;
  listeners.forEach((handler) => handler(online));
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    setOnline(false);
    throw new Error('未连接到电脑服务器，数据未同步。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // 能拿到响应就说明服务器在线，只是这次请求失败了。
    setOnline(true);
    throw new Error(body.error || '服务器请求失败，请稍后重试。');
  }
  setOnline(true);
  return response.json();
}

export function fetchLibrary() {
  return requestJson('/api/library');
}

export function putArticle(article) {
  return requestJson(`/api/library/articles/${encodeURIComponent(article.id)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(article)
  });
}

export function deleteArticle(id) {
  return requestJson(`/api/library/articles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function putFolder(folder) {
  return requestJson(`/api/library/folders/${encodeURIComponent(folder.id)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(folder)
  });
}

export function deleteFolder(id) {
  return requestJson(`/api/library/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchWordbook() {
  return requestJson('/api/wordbook');
}

export function putWordbook(entries) {
  return requestJson('/api/wordbook', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ entries }) });
}

export function importLocalData(payload) {
  return requestJson('/api/library/import', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
}
