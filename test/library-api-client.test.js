import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteArticle,
  deleteFolder,
  fetchLibrary,
  fetchWordbook,
  importLocalData,
  putArticle,
  putFolder,
  putWordbook,
  subscribeServerStatus
} from '../public/js/library-api.js';

// 用 stub 换掉 globalThis.fetch：客户端唯一的副作用就是这个全局函数。
function withStubFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return Promise.resolve()
    .then(() => run(calls))
    .finally(() => { globalThis.fetch = original; });
}

test('fetchLibrary 打到 /api/library 并返回解析后的 body', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [{ id: 'a1' }], folders: [] }), { status: 200 }),
    async (calls) => {
      const result = await fetchLibrary();
      assert.deepEqual(result.articles, [{ id: 'a1' }]);
      assert.equal(calls[0].url, '/api/library');
      assert.equal(calls[0].options.method, undefined);
    }
  );
});

test('putArticle 用 PUT 打到带 id 的地址并带 JSON 头', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ article: { id: 'a1' } }), { status: 200 }),
    async (calls) => {
      await putArticle({ id: 'a1', article: 'Hello.' });
      assert.equal(calls[0].url, '/api/library/articles/a1');
      assert.equal(calls[0].options.method, 'PUT');
      assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(calls[0].options.body), { id: 'a1', article: 'Hello.' });
    }
  );
});

test('putWordbook 把数组包进 entries 字段', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ ok: true, saved: 1 }), { status: 200 }),
    async (calls) => {
      await putWordbook([{ word: 'hello' }]);
      assert.equal(calls[0].url, '/api/wordbook');
      assert.deepEqual(JSON.parse(calls[0].options.body), { entries: [{ word: 'hello' }] });
    }
  );
});

test('网络不可达时抛中文文案并把在线状态切到离线', async () => {
  const seen = [];
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(() => fetchLibrary(), { message: /未连接到电脑服务器/ });
  });
  unsubscribe();
  assert.deepEqual(seen, [true, false]);
});

test('服务端 500 时抛服务端错误文案，但状态仍是在线', async () => {
  // 模块级的在线状态会在同一文件的 test 之间保留（上一个 test 把它切成了离线），
  // 所以先用一次成功请求复位，再断言 500 不会把它判成离线。
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [], folders: [] }), { status: 200 }),
    () => fetchLibrary()
  );
  const seen = [];
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(
    () => new Response(JSON.stringify({ error: '文章库文件无法解析：/tmp/library.json' }), { status: 500 }),
    async () => {
      await assert.rejects(() => fetchLibrary(), { message: /无法解析/ });
    }
  );
  unsubscribe();
  assert.deepEqual(seen, [true]);
});

test('其余导出打到正确的地址与方法（含需要转义的 id）', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ ok: true, folder: { id: 'f/1' }, entries: [] }), { status: 200 }),
    async (calls) => {
      await deleteArticle('a/1 号');
      await putFolder({ id: 'f/1', name: '真题听力' });
      await deleteFolder('f/1');
      await fetchWordbook();
      await importLocalData({ articles: [], folders: [], wordbook: [] });
      assert.deepEqual(calls.map((call) => [call.options.method ?? 'GET', call.url]), [
        ['DELETE', '/api/library/articles/a%2F1%20%E5%8F%B7'],
        ['PUT', '/api/library/folders/f%2F1'],
        ['DELETE', '/api/library/folders/f%2F1'],
        ['GET', '/api/wordbook'],
        ['POST', '/api/library/import']
      ]);
    }
  );
});

test('请求带 AbortSignal，200 但不是 JSON 时给中文提示', async () => {
  await withStubFetch(
    (url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return new Response('<!doctype html><title>Wi-Fi 登录</title>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    },
    async () => {
      await assert.rejects(() => fetchLibrary(), { message: /无法解析的数据/ });
    }
  );
});

test('连接被中止（超时）时按「未连接」处理并切到离线', async () => {
  const seen = [];
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(() => { throw new DOMException('Aborted', 'AbortError'); }, async () => {
    await assert.rejects(() => fetchLibrary(), { message: /未连接到电脑服务器/ });
  });
  unsubscribe();
  assert.deepEqual(seen, [true, false]);
});

test('单个订阅者抛错不影响其他订阅者，也不会顶掉请求错误', async () => {
  // 与上一个 test 同理：模块级的在线状态在 test 之间保留（超时那条把它留在了离线），
  // 先用一次成功请求复位，否则订阅时的首次回调不会发出 true。
  await withStubFetch(
    () => new Response(JSON.stringify({ entries: [] }), { status: 200 }),
    () => fetchWordbook()
  );
  const seen = [];
  let firstCall = true;
  // 初次调用不抛（否则会在订阅时就被移除），之后的每次通知都抛。
  const bad = () => { if (!firstCall) throw new Error('订阅者自己炸了'); firstCall = false; };
  const unsubscribeBad = subscribeServerStatus(bad);
  const unsubscribeGood = subscribeServerStatus((online) => seen.push(online));
  await withStubFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(() => fetchLibrary(), { message: /未连接到电脑服务器/ });
  });
  unsubscribeBad();
  unsubscribeGood();
  assert.deepEqual(seen, [true, false]);
});

test('读响应体时超时被中止，按「未连接」而不是「数据无法解析」处理', async () => {
  const seen = [];
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [], folders: [] }), { status: 200 }),
    () => fetchLibrary()
  );
  const unsubscribe = subscribeServerStatus((online) => seen.push(online));
  // 响应头已经拿到，但响应体读取被中止——等价于门户/弱网把响应体挂住直至超时。
  await withStubFetch(
    () => ({
      ok: true,
      json: async () => { throw new DOMException('Aborted', 'AbortError'); }
    }),
    async () => {
      await assert.rejects(() => fetchLibrary(), { message: /未连接到电脑服务器/ });
    }
  );
  unsubscribe();
  assert.deepEqual(seen, [true, false]);
});
