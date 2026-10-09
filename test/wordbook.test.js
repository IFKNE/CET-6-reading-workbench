import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrUpdateWord, createMarkdown, createWordSummary, filterWords, getWordContextSentence, isWordSaved, resolveStoredWordForm, savedWordKeys } from '../public/js/wordbook.js';

test('同一词形更新而不是重复收藏', () => {
  const first = addOrUpdateWord([], { word: 'study', meaning: '学习', partOfSpeech: 'v.', context: 'I study every day.', savedAt: '2026-10-05' });
  const second = addOrUpdateWord(first, { word: 'Study', meaning: '研究', partOfSpeech: 'n.', context: 'The study is useful.', savedAt: '2026-10-05' });
  assert.equal(second.length, 1);
  assert.equal(second[0].meaning, '研究');
});

test('导出的 Markdown 包含词义和原句', () => {
  const markdown = createMarkdown([{ word: 'study', meaning: '学习', partOfSpeech: 'v.', context: 'I study every day.', savedAt: '2026-10-05' }], '2026-10-05');
  assert.match(markdown, /## study/);
  assert.match(markdown, /- 释义：v\. 学习/);
  assert.match(markdown, /> I study every day\./);
});

test('同一单词合并文章来源并保留每篇出现次数', () => {
  const entries = addOrUpdateWord([], {
    word: 'critical', meaning: '关键的', partOfSpeech: 'adj.', context: 'A critical issue.', savedAt: '2026-10-06',
    source: { articleId: 'article-1', title: '文章一', count: 2 }
  });
  const updated = addOrUpdateWord(entries, {
    word: 'Critical', meaning: '关键的', partOfSpeech: 'adj.', context: 'Another critical issue.', savedAt: '2026-10-06',
    source: { articleId: 'article-2', title: '文章二', count: 1 }
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].sources['article-1'].count, 2);
  assert.equal(updated[0].sources['article-2'].count, 1);
});

test('单词本搜索词仍会匹配来源文章标题', () => {
  const entries = [{ word: 'critical', meaning: '关键的', sources: { a1: { title: '批判性阅读', count: 2 } } }, { word: 'evidence', meaning: '证据' }];
  assert.deepEqual(filterWords(entries, { query: '批判' }).map((item) => item.word), ['critical']);
  assert.deepEqual(filterWords(entries, { query: '证据' }).map((item) => item.word), ['evidence']);
});

test('来源筛选不再由 filterWords 负责', () => {
  const entries = [{ word: 'critical', sources: { a1: { title: '批判性阅读' } } }, { word: 'evidence', sources: {} }];
  assert.deepEqual(filterWords(entries, { sourceId: 'a1' }).map((item) => item.word), ['critical', 'evidence']);
});

test('单词本可按掌握状态筛选', () => {
  const entries = [{ word: 'critical', learningStatus: 'fuzzy' }, { word: 'evidence', learningStatus: 'known' }];
  assert.deepEqual(filterWords(entries, { status: 'fuzzy' }).map((item) => item.word), ['critical']);
});

test('单词本只提取包含目标词的一句原文', () => {
  const sentence = getWordContextSentence('First sentence. Critical reading matters. Last sentence.', 'critical');
  assert.equal(sentence, 'Critical reading matters.');
});

test('单词列表摘要只保留常用释义和短语，不保留整段上下文', () => {
  const summary = createWordSummary({
    word: 'critical', partOfSpeech: 'adj.', meaning: '关键的',
    phrases: [{ phrase: 'critical thinking', meaning: '批判性思维' }],
    context: 'First sentence. Critical reading matters. Last sentence.'
  });
  assert.equal(summary.meaning, 'adj. · 关键的');
  assert.equal(summary.phrase, 'critical thinking · 批判性思维');
  assert.equal(summary.example, 'Critical reading matters.');
});

test('按小写词形判断单词是否已收录', () => {
  const entries = [{ word: 'critical' }, { word: 'evidence' }];
  assert.equal(isWordSaved(entries, 'Critical'), true);
  assert.equal(isWordSaved(entries, 'critical'), true);
  assert.equal(isWordSaved(entries, 'judgment'), false);
  assert.equal(isWordSaved([], 'critical'), false);
  assert.equal(isWordSaved(null, 'critical'), false);
});

test('已收录词形集合可一次性标记重点词卡片', () => {
  const keys = savedWordKeys([{ word: 'Critical' }, { word: 'Evidence' }, { word: '' }, {}]);
  assert.equal(keys.has('critical'), true);
  assert.equal(keys.has('evidence'), true);
  assert.equal(keys.size, 2);
});

test('已收录判定忽略词形首尾空白', () => {
  assert.equal(isWordSaved([{ word: '  Critical  ' }], ' critical '), true);
  assert.equal(savedWordKeys([{ word: '  Evidence ' }]).has('evidence'), true);
  assert.equal(savedWordKeys([{ word: '   ' }]).size, 0);
});

test('入库词形以 AI 词元为准并统一小写去空白', () => {
  assert.equal(resolveStoredWordForm({ word: 'Run' }, 'running'), 'run');
  assert.equal(resolveStoredWordForm({}, '  Running '), 'running');
  assert.equal(resolveStoredWordForm(null, 'running'), 'running');
  assert.equal(resolveStoredWordForm({ word: '' }, 'running'), 'running');
});
