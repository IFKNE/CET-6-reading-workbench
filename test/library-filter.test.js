import test from 'node:test';
import assert from 'node:assert/strict';
import { filterArticles, listCategories, validateFolderName } from '../public/js/library-filter.js';

const articles = [
  { id: 'a1', title: '对话一', category: '听力原文', folderId: 'f1' },
  { id: 'a2', title: '对话二', category: '听力原文', folderId: 'f1' },
  { id: 'a3', title: '长篇一', category: '长篇阅读', folderId: '' },
  { id: 'a4', title: '短篇一', category: '短篇阅读', folderId: 'f1' },
  { id: 'a5', title: '短篇二', category: '短篇阅读' },
  { id: 'a6', title: '无分类', category: '   ' }
];

test('按出现次数汇总文章类型', () => {
  // 篇数相同（听力原文 / 短篇阅读 各 2 篇）时按名称升序，即 localeCompare(…, 'zh-CN') 的顺序：
  // 本机 ICU 排为 短篇阅读 < 听力原文 < 长篇阅读。这里的并列顺序**不是**文章出现顺序。
  assert.deepEqual(listCategories(articles), [
    { name: '短篇阅读', count: 2 },
    { name: '听力原文', count: 2 },
    { name: '长篇阅读', count: 1 }
  ]);
  assert.deepEqual(listCategories([]), []);
  assert.deepEqual(listCategories(null), []);
});

test('类型相同时按名称升序', () => {
  // 输入故意乱序：断言结果确实按名称升序（zh-CN 排序），而不是保持输入顺序。
  const list = listCategories([
    { category: '长篇阅读' },
    { category: '短篇阅读' },
    { category: '听力原文' }
  ]);
  assert.deepEqual(list.map((item) => item.name), ['短篇阅读', '听力原文', '长篇阅读']);
});

test('按文件夹与类型取交集筛选', () => {
  const ids = (options) => filterArticles(articles, options).map((article) => article.id);
  assert.deepEqual(ids({}), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  assert.deepEqual(ids({ category: '听力原文' }), ['a1', 'a2']);
  assert.deepEqual(ids({ folderId: 'f1' }), ['a1', 'a2', 'a4']);
  assert.deepEqual(ids({ folderId: 'f1', category: '短篇阅读' }), ['a4']);
  assert.deepEqual(ids({ folderId: '', category: '长篇阅读' }), ['a3']);
  assert.deepEqual(ids({ folderId: 'f1', category: '长篇阅读' }), []);
});

test('缺字段的文章按未归档处理', () => {
  const list = filterArticles([{ id: 'x' }], { folderId: '' });
  assert.deepEqual(list.map((article) => article.id), ['x']);
});

test('新建文件夹名称校验', () => {
  const folders = [{ id: 'f1', name: '听力文件夹' }];
  assert.deepEqual(validateFolderName('', folders), { ok: false, message: '请输入文件夹名称。' });
  assert.deepEqual(validateFolderName('   ', folders), { ok: false, message: '请输入文件夹名称。' });
  assert.deepEqual(validateFolderName(' 听力文件夹 ', folders), { ok: false, message: '已有同名文件夹“听力文件夹”。' });
  assert.deepEqual(validateFolderName('阅读文件夹', folders), { ok: true, message: '' });
  assert.deepEqual(validateFolderName('阅读文件夹', null), { ok: true, message: '' });
});
