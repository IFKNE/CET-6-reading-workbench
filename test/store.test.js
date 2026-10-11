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

test('写入是原子的：落盘后不残留临时文件，且文件是合法 JSON', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'Atomic write.', updatedAt: '2026-10-11T00:00:00.000Z' });
  const files = await fs.readdir(dataDir);
  assert.deepEqual(files, ['library.json']);
  const parsed = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.equal(parsed.articles.length, 1);
  assert.equal(parsed.version, 1);
});

test('文件损坏时抛错，且不改写原文件', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-broken-'));
  const broken = '{ 这不是 JSON';
  await fs.writeFile(path.join(dataDir, 'library.json'), broken, 'utf8');
  const store = createStore({ dataDir });
  await assert.rejects(() => store.listArticles(), { message: /无法解析/ });
  await assert.rejects(() => store.putArticle({ id: 'a1', article: 'x' }), { message: /无法解析/ });
  assert.equal(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), broken);
});

test('文档形状或版本不合法时同样报错，且不改写文件', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-shape-'));
  const original = JSON.stringify({ version: 1, articles: 'oops', folders: [], wordbook: [] });
  await fs.writeFile(path.join(dataDir, 'library.json'), original, 'utf8');
  await assert.rejects(() => createStore({ dataDir }).listArticles(), { message: /无法解析/ });

  const versioned = await fs.mkdtemp(path.join(os.tmpdir(), 'cet6-store-version-'));
  await fs.writeFile(path.join(versioned, 'library.json'), JSON.stringify({ version: 2, articles: [], folders: [], wordbook: [] }), 'utf8');
  await assert.rejects(() => createStore({ dataDir: versioned }).listArticles(), { message: /不支持的文档版本/ });
  assert.equal(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'), original);
});

test('putArticle 的返回值也是副本，改它不会写进存储', async () => {
  // 返回值若引用内部状态，调用方改一下就只改了内存、没改磁盘，
  // 下一次成功写入会把它带上盘——和 Task 1 修掉的“内存领先磁盘”是同一类问题。
  const { store } = await createTemporaryStore();
  const saved = await store.putArticle({ id: 'a1', article: 'One.', updatedAt: '2026-10-11T00:00:00.000Z' });
  saved.article = '被调用方改了';
  assert.equal((await store.getArticle('a1')).article, 'One.');
});

test('删除文件夹会把其中文章解绑为未归档并计数', async () => {
  // 注入固定时钟：断言解绑时确实盖了当前时间，而不是靠“不等于旧值”这种弱断言。
  const stamp = '2026-10-11T02:00:00.000Z';
  const { store } = await createTemporaryStore({ now: () => stamp });
  await store.putFolder({ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a1', article: 'One.', folderId: 'f1', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a2', article: 'Two.', folderId: 'f1', updatedAt: '2026-10-11T00:00:00.000Z' });
  await store.putArticle({ id: 'a3', article: 'Three.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z' });

  assert.deepEqual(await store.listFolders(), [{ id: 'f1', name: '真题听力', createdAt: '2026-10-11T00:00:00.000Z' }]);
  const result = await store.deleteFolder('f1');
  assert.equal(result.detached, 2);
  assert.deepEqual(await store.listFolders(), []);
  const articles = await store.listArticles();
  assert.deepEqual(articles.map((article) => article.folderId), ['', '', '']);
  // 解绑会刷新 updatedAt，否则手机/电脑合并时这条改动可能被判为“不更新”。
  assert.deepEqual(articles.filter((article) => article.id !== 'a3').map((article) => article.updatedAt), [stamp, stamp]);
  assert.equal(articles.find((article) => article.id === 'a3').updatedAt, '2026-10-11T00:00:00.000Z');
});

test('单词本是整体替换', async () => {
  const { store } = await createTemporaryStore();
  await store.putWordbook([{ word: 'hello', meaning: '你好' }, { word: 'world', meaning: '世界' }]);
  assert.deepEqual((await store.getWordbook()).map((entry) => entry.word), ['hello', 'world']);
  await store.putWordbook([{ word: 'hello', meaning: '你好（改）' }]);
  assert.deepEqual(await store.getWordbook(), [{ word: 'hello', meaning: '你好（改）' }]);
});

test('并发写入被串行化，结果全部保留且文件仍可解析', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await Promise.all(Array.from({ length: 10 }, (_, index) => store.putArticle({
    id: `a${index}`, article: `Article ${index}.`, updatedAt: '2026-10-11T00:00:00.000Z'
  })));
  const articles = await store.listArticles();
  assert.equal(articles.length, 10);
  const parsed = JSON.parse(await fs.readFile(path.join(dataDir, 'library.json'), 'utf8'));
  assert.equal(parsed.articles.length, 10);
});

test('迁移时文章取 updatedAt 较新的一方，文件夹按 id 覆盖', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'Server copy.', updatedAt: '2026-10-11T10:00:00.000Z' });
  await store.putFolder({ id: 'f1', name: '服务器文件夹', createdAt: '2026-10-11T00:00:00.000Z' });
  // 服务器上已经有 'hello'：本机那条「旧释义」不该覆盖它（与文章取 updatedAt 较新者同理）。
  await store.putWordbook([{ word: 'hello', meaning: '服务器释义' }]);

  const result = await store.importAll({
    articles: [
      { id: 'a1', article: 'Local stale copy.', updatedAt: '2026-10-11T09:00:00.000Z' },
      { id: 'a2', article: 'Local fresh copy.', updatedAt: '2026-10-11T11:00:00.000Z' }
    ],
    folders: [
      { id: 'f1', name: '本机文件夹', createdAt: '2026-10-11T00:00:00.000Z' },
      { id: 'f2', name: '新文件夹', createdAt: '2026-10-11T00:00:00.000Z' }
    ],
    wordbook: [{ word: 'hello', meaning: '本机旧释义' }, { word: 'brandnew', meaning: '新词' }]
  });

  assert.equal(result.articles, 1);
  assert.equal(result.folders, 2);
  assert.equal(result.wordbook, 1);
  const articles = await store.listArticles();
  assert.equal(articles.find((article) => article.id === 'a1').article, 'Server copy.');
  assert.equal(articles.find((article) => article.id === 'a2').article, 'Local fresh copy.');
  // .sort() 按 UTF-16 码元排序：'新'(U+65B0) 在 '本'(U+672C) 之前。
  assert.deepEqual((await store.listFolders()).map((folder) => folder.name).sort(), ['新文件夹', '本机文件夹']);
  assert.deepEqual((await store.getWordbook()).map((entry) => entry.word), ['hello', 'brandnew']);
});

test('迁移时单词本保留服务器已有条目，只补新词', async () => {
  const { store } = await createTemporaryStore();
  await store.putWordbook([{ word: 'hello', meaning: '服务器释义', learningStatus: 'known' }]);
  const result = await store.importAll({ wordbook: [{ word: 'HELLO', meaning: '本机释义' }, { word: '', meaning: '坏数据' }] });
  assert.equal(result.wordbook, 0);
  assert.deepEqual(await store.getWordbook(), [{ word: 'hello', meaning: '服务器释义', learningStatus: 'known' }]);
});

test('putWordbook 拒绝非数组，不会写出自己读不回来的文档', async () => {
  const { dataDir, store } = await createTemporaryStore();
  await assert.rejects(() => store.putWordbook('hello'), { message: /entries 必须是数组/ });
  // 关键：拒绝之后文件仍然可读——否则整库会因为一次坏调用变成打不开的状态。
  assert.deepEqual(await createStore({ dataDir }).getWordbook(), []);
});

test('deleteFolder 收到空 id 时不动「未归档」的文章', async () => {
  const { store } = await createTemporaryStore();
  await store.putArticle({ id: 'a1', article: 'One.', folderId: '', updatedAt: '2026-10-11T00:00:00.000Z' });
  assert.deepEqual(await store.deleteFolder(''), { detached: 0 });
  assert.equal((await store.getArticle('a1')).updatedAt, '2026-10-11T00:00:00.000Z');
});
