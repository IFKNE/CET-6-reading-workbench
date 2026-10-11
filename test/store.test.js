import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';

async function createTemporaryStore(options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-'));
  return { dataDir, store: createStore({ dataDir, ...options }) };
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

test('写入会落盘：换一个新实例仍能读回同一份数据', async () => {
  // 只有这条能证明数据真的在磁盘上——同实例读回可能只是读了内存缓存。
  const { dataDir, store } = await createTemporaryStore();
  const article = { id: 'a1', article: 'Hello world.', updatedAt: '2026-10-11T00:00:00.000Z' };
  await store.putArticle(article);
  const reopened = createStore({ dataDir });
  assert.deepEqual(await reopened.listArticles(), [article]);
});

test('只读不写时不会创建文件', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.listArticles();
  await assert.rejects(() => fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), { code: 'ENOENT' });
});

test('返回的数组与对象都是副本，改它不会影响存储', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const list = await store.listArticles();
  list.push({ id: 'ghost' });
  list[0].article = '被改了';
  assert.deepEqual((await store.listArticles()).map((item) => item.id), ['a1']);
  assert.equal((await store.getArticle('a1')).article, 'One.');
});

test('落盘失败时内存不领先磁盘，后续写入不会把失败的改动带上盘', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a2', article: 'Two.', updatedAt: '2026-10-11T00:00:00.000Z' });

  // 把临时文件路径先占成一个目录：writeFile 必然失败，等价于“磁盘写不进去”。
  const blocked = path.join(dataDir, 'library.json.tmp');
  await fs.mkdir(blocked);
  await assert.rejects(() => store.deleteArticle('a1'));
  await fs.rm(blocked, { recursive: true, force: true });

  // 失败的删除没有生效……
  assert.deepEqual((await store.listArticles()).map((item) => item.id), ['a1', 'a2']);
  // ……而且后续成功写入也不会顺手把它落盘。
  await store.putArticle({ id: 'a3', article: 'Three.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.deepEqual(onDisk.articles.map((item) => item.id).sort(), ['a1', 'a2', 'a3']);
});
