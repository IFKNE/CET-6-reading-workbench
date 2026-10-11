const jsonHeaders = { 'Content-Type': 'application/json' };
// 手机在弱网/认证门户下可能拿到永不完成的连接：不加超时，界面会一直以为服务器在线。
const REQUEST_TIMEOUT_MS = 20000;

const listeners = new Set();
let online = true;

// 服务器在线状态：任何请求都能翻转它，界面据此显示/隐藏“未连接”提示条。
export function subscribeServerStatus(handler) {
  listeners.add(handler);
  try {
    handler(online);
  } catch (error) {
    // 初次回调就抛错的话，别把这个订阅者永久留在集合里（否则提示条再也更新不了）。
    listeners.delete(handler);
    throw error;
  }
  return () => listeners.delete(handler);
}

function setOnline(next) {
  if (next === online) return;
  online = next;
  listeners.forEach((handler) => {
    // 单个订阅者抛错既不能影响其他订阅者，也不能把请求自己的错误顶掉。
    try {
      handler(online);
    } catch (error) {
      listeners.delete(handler);
      console.error('服务器状态订阅回调抛错，已移除该订阅者。', error);
    }
  });
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let body;
  let parsed = true;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
    // 计时器要一直活到读完响应体：认证门户可能先回响应头、再把响应体挂住。
    body = await response.json().catch(() => { parsed = false; return null; });
  } catch {
    // 网络不可达、连接被中止（超时）都算「没连上电脑服务器」。
    setOnline(false);
    throw new Error('未连接到电脑服务器，数据未同步。');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    // 能拿到响应就说明服务器在线，只是这次请求失败了。
    setOnline(true);
    throw new Error(body?.error || '服务器请求失败，请稍后重试。');
  }
  setOnline(true);
  if (!parsed) {
    // 200 却不是 JSON：公共 Wi-Fi 的认证门户就长这样，必须给出能看懂的中文提示。
    throw new Error('服务器返回了无法解析的数据，请确认访问的是电脑上的服务器地址。');
  }
  return body;
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
