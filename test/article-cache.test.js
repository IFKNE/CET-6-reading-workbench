import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleKey, createWarmupBatches, indexVocabulary, mergeVocabulary } from '../public/js/article-cache.js';

test('文章键忽略段首尾空白但区分不同正文', () => {
  assert.equal(createArticleKey('  Read well.  '), createArticleKey('Read well.'));
  assert.notEqual(createArticleKey('Read well.'), createArticleKey('Read deeply.'));
});

test('单词查询结果补充到预研读词表', () => {
  const cache = { vocabulary: { critical: { word: 'critical' } } };
  const result = mergeVocabulary(cache, { word: 'evidence', contextMeaning: '证据' });
  assert.equal(result.vocabulary.critical.word, 'critical');
  assert.equal(result.vocabulary.evidence.contextMeaning, '证据');
});

test('预研读词表按小写词形建立即时查询索引', () => {
  const vocabulary = indexVocabulary([
    { word: 'Critical', contextMeaning: '关键的' },
    { word: 'Evidence', contextMeaning: '证据' },
    { contextMeaning: '无效条目' },
  ]);

  assert.equal(vocabulary.critical.contextMeaning, '关键的');
  assert.equal(vocabulary.evidence.contextMeaning, '证据');
  assert.equal(Object.keys(vocabulary).length, 2);
});

test('预热队列优先首段、跳过已缓存词并按八个词分批', () => {
  const batches = createWarmupBatches(
    'Critical analysis improves academic reasoning and evidence evaluation.\n\nSubsequent paragraphs introduce alternative explanations and methodological limitations.',
    { critical: { word: 'critical' } },
    { batchSize: 3, maxWords: 6 }
  );
  assert.deepEqual(batches[0], ['analysis', 'improves', 'academic']);
  assert.equal(batches.flat().includes('critical'), false);
  assert.equal(batches.flat().length, 6);
});
