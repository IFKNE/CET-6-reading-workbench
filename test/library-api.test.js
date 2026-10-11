import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';

const translator = { translate: async () => { throw new Error('不应调用翻译服务'); } };

async function createTestApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-api-'));
  return createApp({ translator, store: createStore({ dataDir }) });
}

const article = (id, overrides = {}) => ({
  id, article: `Body of ${id}.`, title: `标题 ${id}`, category: '短篇阅读', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z', ...overrides
});

test('空库时 GET /api/library 返回空数组', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/library');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { articles: [], folders: [] });
});

test('PUT 文章后能在 GET 里读到，DELETE 之后消失', async () => {
  const app = await createTestApp();
  const put = await request(app).put('/api/library/articles/a1').send(article('a1'));
  assert.equal(put.status, 200);
  // 整体比较，防止 title/category/folderId 在往返中被悄悄丢掉。
  assert.deepEqual(put.body.article, article('a1'));
  assert.equal((await request(app).get('/api/library')).body.articles.length, 1);

  const remove = await request(app).delete('/api/library/articles/a1');
  assert.equal(remove.status, 200);
  assert.deepEqual(remove.body, { ok: true, removed: 1 });
  assert.deepEqual((await request(app).get('/api/library')).body.articles, []);
  // 幂等：重复删除仍是 200。
  assert.equal((await request(app).delete('/api/library/articles/a1')).status, 200);
});

test('PUT 文章校验 id 一致、正文非空且不超长', async () => {
  const app = await createTestApp();
  const mismatch = await request(app).put('/api/library/articles/a1').send(article('a2'));
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error, /必须与地址里的 id 一致/);

  const empty = await request(app).put('/api/library/articles/a1').send(article('a1', { article: '   ' }));
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /非空文本/);

  const tooLong = await request(app).put('/api/library/articles/a1').send(article('a1', { article: 'x'.repeat(100001) }));
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.body.error, /100000/);
});

test('文件夹可增删，删除时返回解绑篇数', async () => {
  const app = await createTestApp();
  assert.equal((await request(app).put('/api/library/folders/f1').send({ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' })).status, 200);
  const bad = await request(app).put('/api/library/folders/f2').send({ id: 'f2', name: '   ' });
  assert.equal(bad.status, 400);

  await request(app).put('/api/library/articles/a1').send(article('a1', { folderId: 'f1' }));
  const remove = await request(app).delete('/api/library/folders/f1');
  assert.equal(remove.status, 200);
  assert.deepEqual(remove.body, { ok: true, detached: 1 });
  const after = (await request(app).get('/api/library')).body;
  assert.equal(after.articles[0].folderId, '');
  // 文件夹本身确实被删掉了，而不只是文章被解绑。
  assert.deepEqual(after.folders, []);
});

test('路径 id 为空白时返回 400，且不改动数据', async () => {
  const app = await createTestApp();
  const response = await request(app).delete('/api/library/articles/%20');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /id 不能为空/);
  assert.deepEqual((await request(app).get('/api/library')).body.articles, []);
});

test('存储层出错时返回 500 并带上原因', async () => {
  // 注入一个必然失败的 store：验证「校验通过之后才写、写失败要转成 500 文案」这条链路。
  const failing = { listArticles: async () => { throw new Error('磁盘写入失败。'); }, listFolders: async () => [] };
  const app = createApp({ translator, store: failing });
  const response = await request(app).get('/api/library');
  assert.equal(response.status, 500);
  assert.equal(response.body.error, '磁盘写入失败。');
});
