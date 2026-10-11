import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';

async function createTemporaryStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-'));
  return { dataDir, store: createStore({ dataDir }) };
}

test('空目录时文章、文件夹、单词本都是空数组', async () => {
  const { store } = await createTemporaryStore();
  assert.deepEqual(await store.listArticles(), []);
  assert.deepEqual(await store.listFolders(), []);
  assert.deepEqual(await store.getWordbook(), []);
  assert.equal(await store.getArticle('missing'), undefined);
});

test('写入文章后可以按 id 读回，且内容与写入一致', async () => {
  const { store } = await createTemporaryStore();
  const article = { id: 'a1', title: '精读一', article: 'Hello world.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z', vocabulary: { hello: { word: 'hello' } } };
  await store.putArticle(article);
  assert.deepEqual(await store.getArticle('a1'), article);
  assert.deepEqual(await store.listArticles(), [article]);

  const updated = { ...article, title: '精读一（改）', updatedAt: '2026-10-11T01:00:00.000Z' };
  await store.putArticle(updated);
  assert.deepEqual(await store.listArticles(), [updated]);

  await store.deleteArticle('a1');
  assert.deepEqual(await store.listArticles(), []);
});
