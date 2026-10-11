import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLibrary, putArticle, subscribeServerStatus, putWordbook } from '../public/js/library-api.js';

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
