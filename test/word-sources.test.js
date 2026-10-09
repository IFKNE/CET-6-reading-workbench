import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSelection, selectAll, toggleArticle, toggleFolder, toggleUnfiled, toggleUnlinked } from '../public/js/word-sources.js';

const tree = {
  folders: [
    { id: 'f1', name: '听力文件夹', articleIds: ['a1', 'a2'], articles: [], count: 3 },
    { id: 'f2', name: '阅读文件夹', articleIds: ['a3'], articles: [], count: 1 }
  ],
  unfiled: { articleIds: ['a9'], articles: [], count: 1 },
  unlinked: { count: 2 },
  total: 6
};

test('默认是全部单词', () => {
  assert.deepEqual(selectAll(), { all: true, articleIds: [], includeUnlinked: false });
});

test('全部单词状态下勾一项等于只看这一项', () => {
  assert.deepEqual(toggleArticle(selectAll(), 'a1'), { all: false, articleIds: ['a1'], includeUnlinked: false });
});

test('再点一次取消该文章', () => {
  const selection = toggleArticle(toggleArticle(selectAll(), 'a1'), 'a1');
  assert.deepEqual(selection, { all: true, articleIds: [], includeUnlinked: false });
});

test('勾文件夹一次选中其中全部文章', () => {
  assert.deepEqual(toggleFolder(selectAll(), tree, 'f1').articleIds, ['a1', 'a2']);
});

test('文件夹全选后再次点击清空该文件夹', () => {
  const selection = toggleFolder(toggleFolder(selectAll(), tree, 'f1'), tree, 'f1');
  assert.deepEqual(selection, { all: true, articleIds: [], includeUnlinked: false });
});

test('文件夹半选时点击补齐而不是清空', () => {
  const partial = toggleArticle(selectAll(), 'a1');
  assert.deepEqual(toggleFolder(partial, tree, 'f1').articleIds, ['a1', 'a2']);
});

test('未归档按同一套逻辑集体勾选', () => {
  assert.deepEqual(toggleUnfiled(selectAll(), tree).articleIds, ['a9']);
});

test('未关联文章可以单独勾选', () => {
  assert.deepEqual(toggleUnlinked(selectAll()), { all: false, articleIds: [], includeUnlinked: true });
});

test('取消最后一个选择回到全部单词', () => {
  const only = toggleArticle(selectAll(), 'a1');
  assert.deepEqual(toggleArticle(only, 'a1'), { all: true, articleIds: [], includeUnlinked: false });
});

test('清空选择等于回到全部单词', () => {
  assert.deepEqual(clearSelection(), selectAll());
});
