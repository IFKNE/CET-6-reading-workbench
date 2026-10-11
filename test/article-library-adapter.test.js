import test from 'node:test';
import assert from 'node:assert/strict';
import { createFolder, getArticle, listArticles, listFolders, saveArticle } from '../public/js/article-library.js';

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

test('listArticles 按 updatedAt 降序（与旧 IndexedDB 契约一致）', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({
      articles: [
        { id: 'old', article: 'Old.', updatedAt: '2026-10-01T00:00:00.000Z' },
        { id: 'new', article: 'New.', updatedAt: '2026-10-11T00:00:00.000Z' }
      ],
      folders: []
    }), { status: 200 }),
    async () => {
      assert.deepEqual((await listArticles()).map((record) => record.id), ['new', 'old']);
    }
  );
});

test('listFolders 按 createdAt 升序', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({
      articles: [],
      folders: [
        { id: 'f2', name: '后建', createdAt: '2026-10-11T00:00:00.000Z' },
        { id: 'f1', name: '先建', createdAt: '2026-10-01T00:00:00.000Z' }
      ]
    }), { status: 200 }),
    async () => {
      assert.deepEqual((await listFolders()).map((folder) => folder.id), ['f1', 'f2']);
    }
  );
});

test('getArticle 未命中时解析为 undefined 而不是抛错', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ articles: [{ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' }], folders: [] }), { status: 200 }),
    async () => {
      assert.equal(await getArticle('missing'), undefined);
      assert.equal((await getArticle('a1')).article, 'One.');
    }
  );
});

test('createFolder 解析出新文件夹的 id（app.js:1297 依赖这个契约）', async () => {
  await withStubFetch(
    (url, options) => {
      if (url === '/api/library') return new Response(JSON.stringify({ articles: [], folders: [] }), { status: 200 });
      return new Response(JSON.stringify({ folder: JSON.parse(options.body) }), { status: 200 });
    },
    async (calls) => {
      const id = await createFolder('  真题听力  ');
      assert.equal(typeof id, 'string');
      assert.ok(id.startsWith('folder-') || id.length > 10);
      const putCall = calls.find((call) => call.options.method === 'PUT');
      assert.equal(putCall.url, `/api/library/folders/${id}`);
      assert.deepEqual(JSON.parse(putCall.options.body).name, '真题听力');
    }
  );
});

test('saveArticle 返回服务器落库后的记录', async () => {
  await withStubFetch(
    () => new Response(JSON.stringify({ article: { id: 'a1', article: 'One.', title: '服务器标题' } }), { status: 200 }),
    async () => {
      const saved = await saveArticle({ id: 'a1', article: 'One.' });
      assert.equal(saved.title, '服务器标题');
    }
  );
});
