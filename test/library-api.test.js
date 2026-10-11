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
  assert.equal(put.body.article.id, 'a1');
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
  assert.match(mismatch.body.error, /id/);

  const empty = await request(app).put('/api/library/articles/a1').send(article('a1', { article: '   ' }));
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /article/);

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
  assert.equal((await request(app).get('/api/library')).body.articles[0].folderId, '');
});
