import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleRecord, countWordInArticle, dedupeArticles, restoreArticleState, updateArticleMetadata } from '../public/js/article-model.js';

test('文章记录保存标题、分类、译文、高亮和重点词', () => {
  const record = createArticleRecord({
    id: 'article-1',
    article: 'Critical reading improves judgment.',
    category: '短篇阅读',
    prestudy: { title: '批判性阅读', translation: ['批判性阅读能提升判断力。'], vocabulary: { critical: {} } },
    highlights: ['critical'],
    createdAt: '2026-10-06T00:00:00.000Z'
  });

  assert.equal(record.title, '批判性阅读');
  assert.equal(record.category, '短篇阅读');
  assert.deepEqual(record.highlights, ['critical']);
  assert.deepEqual(record.translation, ['批判性阅读能提升判断力。']);
});

test('文章记录保留译文协议版本，避免恢复旧版错位缓存', () => {
  const record = createArticleRecord({
    id: 'article-translation-v2', article: 'First.\n\nSecond.', category: '短篇阅读',
    prestudy: { title: '版本化译文', translationVersion: 2, translation: ['一', '二'], vocabulary: {} }, highlights: []
  });
  assert.equal(record.translationVersion, 2);
  assert.equal(restoreArticleState(record).prestudy.translationVersion, 2);
});

test('文章记录保存并恢复所属文件夹', () => {
  const record = createArticleRecord({
    id: 'article-folder', article: 'A text.', category: '长篇阅读', folderId: 'folder-reading',
    prestudy: { title: '文件夹测试' }, highlights: []
  });
  assert.equal(record.folderId, 'folder-reading');
  assert.equal(restoreArticleState(record).folderId, 'folder-reading');
});

test('文章记录保存并恢复分段小记', () => {
  const record = createArticleRecord({
    id: 'article-notes', article: 'Text', category: '短篇阅读', prestudy: { title: '小记' }, highlights: [],
    notes: { 0: '第一段转折词很重要' }
  });
  assert.equal(record.notes[0], '第一段转折词很重要');
  assert.equal(restoreArticleState(record).notes[0], '第一段转折词很重要');
});

test('词频忽略大小写并按完整单词计算', () => {
  assert.equal(countWordInArticle('Critical thinking is critically important. Critical!', 'critical'), 2);
});

test('已保存文章可转换为精读页面状态', () => {
  const restored = restoreArticleState({
    id: 'a1', article: 'Text', title: '标题', category: '听力原文',
    translation: ['译文'], vocabulary: { text: {} }, highlights: ['text']
  });

  assert.equal(restored.articleId, 'a1');
  assert.equal(restored.category, '听力原文');
  assert.equal(restored.prestudy.translation[0], '译文');
});

test('更新文章元数据不改变文章正文', () => {
  const updated = updateArticleMetadata({ id: 'a1', article: 'Original', title: '旧标题', category: '短篇阅读' }, { title: '新标题', category: '听力原文' });
  assert.equal(updated.article, 'Original');
  assert.equal(updated.title, '新标题');
  assert.equal(updated.category, '听力原文');
});

test('书架只保留同一正文的最近保存记录', () => {
  const articles = dedupeArticles([
    { id: 'old', article: 'Same article.', updatedAt: '2026-10-07T08:00:00.000Z' },
    { id: 'new', article: ' Same article. ', updatedAt: '2026-10-07T09:00:00.000Z' },
    { id: 'other', article: 'Different article.', updatedAt: '2026-10-07T07:00:00.000Z' }
  ]);
  assert.deepEqual(articles.map((article) => article.id), ['new', 'other']);
});
