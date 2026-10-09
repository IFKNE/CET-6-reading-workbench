import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSelection, createSourceTree, describeSelection, filterEntriesBySource, groupCheckState, selectAll, toggleArticle, toggleFolder, toggleUnfiled, toggleUnlinked } from '../public/js/word-sources.js';

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

const entries = [
  { word: 'critical', sources: { a1: { title: '对话一', count: 2 }, a3: { title: '长篇一', count: 1 } } },
  { word: 'evidence', sources: { a1: { title: '对话一', count: 1 } } },
  { word: 'judgment', sources: { a9: { title: '未归档文章', count: 1 } } },
  { word: 'phrase one', entryType: 'phrase' },
  { word: 'gone', sources: { a404: { title: '已删除的文章', count: 1 } } }
];
const articles = [
  { id: 'a1', title: '对话一', folderId: 'f1' },
  { id: 'a2', title: '对话二', folderId: 'f1' },
  { id: 'a3', title: '长篇一', folderId: '' },
  { id: 'a9', title: '未归档文章', folderId: '' }
];
const folders = [{ id: 'f1', name: '听力文件夹' }, { id: 'f2', name: '空文件夹' }];

test('来源树按文件夹聚合并给出各层单词数', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.deepEqual(sourceTree.folders.map((folder) => folder.id), ['f1']);
  assert.deepEqual(sourceTree.folders[0].articleIds, ['a1']);
  assert.equal(sourceTree.folders[0].count, 2);
  assert.deepEqual(sourceTree.unfiled.articleIds.sort(), ['a3', 'a404', 'a9']);
  assert.equal(sourceTree.unfiled.count, 3);
  assert.equal(sourceTree.unlinked.count, 1);
  assert.equal(sourceTree.total, 5);
});

test('文章不在精读库里时按条目里保存的标题落到未归档', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  const gone = sourceTree.unfiled.articles.find((article) => article.id === 'a404');
  assert.equal(gone.title, '已删除的文章');
});

test('没有单词的文件夹不出现', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.equal(sourceTree.folders.some((folder) => folder.id === 'f2'), false);
});

test('多选来源取并集且不重复', () => {
  const selection = { all: false, articleIds: ['a1', 'a3'], includeUnlinked: false };
  assert.deepEqual(filterEntriesBySource(entries, selection).map((entry) => entry.word), ['critical', 'evidence']);
});

test('未关联文章只在勾选时命中', () => {
  assert.deepEqual(filterEntriesBySource(entries, { all: false, articleIds: ['a1'], includeUnlinked: true }).map((entry) => entry.word), ['critical', 'evidence', 'phrase one']);
});

test('全部单词命中所有条目', () => {
  assert.equal(filterEntriesBySource(entries, selectAll()).length, entries.length);
});

test('文件夹勾选框三态', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.equal(groupCheckState(['a1'], selectAll()), 'all');
  assert.equal(groupCheckState(['a1'], toggleArticle(selectAll(), 'a1')), 'all');
  assert.equal(groupCheckState(['a1', 'a2'], toggleArticle(selectAll(), 'a1')), 'some');
  assert.equal(groupCheckState(['a2'], toggleArticle(selectAll(), 'a1')), 'none');
  assert.equal(groupCheckState([], selectAll()), 'none');
  assert.equal(sourceTree.folders[0].articleIds.length, 1);
});

test('未筛选时按钮显示全部单词', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.deepEqual(describeSelection(selectAll(), sourceTree, entries), { label: '全部单词', detail: '', active: false });
});

test('选中整文件夹显示文件夹名', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.equal(describeSelection(toggleFolder(selectAll(), sourceTree, 'f1'), sourceTree, entries).label, '听力文件夹');
});

test('多选时显示首项与其余数量', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  const selection = { all: false, articleIds: ['a1', 'a3'], includeUnlinked: false };
  const described = describeSelection(selection, sourceTree, entries);
  // a1 是 f1 里唯一有单词的文章，勾上 a1 就等于勾满 f1，因此首项是文件夹名。
  assert.equal(described.label, '听力文件夹 +1 项');
  assert.equal(described.detail, '已选 2 项 · 2 个单词');
  assert.equal(described.active, true);
});

test('只勾未关联文章时的文案', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  assert.equal(describeSelection(toggleUnlinked(selectAll()), sourceTree, entries).label, '未关联文章');
});

test('勾满一个文件夹只算一项', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  const described = describeSelection(toggleFolder(selectAll(), sourceTree, 'f1'), sourceTree, entries);
  assert.equal(described.label, '听力文件夹');
  assert.equal(described.detail, '已选 1 项 · 2 个单词');
});

test('勾满两个文件夹时标签用文件夹名相加', () => {
  const manyEntries = [
    { word: 'critical', sources: { a1: { title: '对话一' } } },
    { word: 'evidence', sources: { a2: { title: '对话二' } } }
  ];
  const manyArticles = [
    { id: 'a1', title: '对话一', folderId: 'f1' },
    { id: 'a2', title: '对话二', folderId: 'f2' }
  ];
  const manyFolders = [{ id: 'f1', name: '听力文件夹' }, { id: 'f2', name: '阅读文件夹' }];
  const sourceTree = createSourceTree(manyEntries, manyArticles, manyFolders);
  const first = toggleFolder(selectAll(), sourceTree, 'f1');
  const both = { ...first, all: false, articleIds: [...first.articleIds, 'a2'] };
  const described = describeSelection(both, sourceTree, manyEntries);
  assert.equal(described.detail, '已选 2 项 · 2 个单词');
  assert.ok(described.label.startsWith('听力文件夹') || described.label.startsWith('阅读文件夹'));
  assert.match(described.label, /\+1 项$/);
});

test('文件夹加它之外的文章算两项', () => {
  const sourceTree = createSourceTree(entries, articles, folders);
  const selection = { all: false, articleIds: ['a1', 'a3'], includeUnlinked: false };
  const described = describeSelection(selection, sourceTree, entries);
  assert.equal(described.label, '听力文件夹 +1 项');
  assert.equal(described.detail, '已选 2 项 · 2 个单词');
});

test('文章单词被移除后仍显示条目里保存的标题', () => {
  const leftWithNothing = [{ word: 'critical', sources: { a1: { title: '对话一' }, a3: { title: '长篇一' } } }];
  const sourceTree = createSourceTree(leftWithNothing, articles, folders);
  const selection = { all: false, articleIds: ['a3'], includeUnlinked: false };
  assert.equal(describeSelection(selection, sourceTree, leftWithNothing).label, '长篇一');
});
