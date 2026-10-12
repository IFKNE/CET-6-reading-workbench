import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrUpdateWord, collectWordSources, createMarkdown, createWordSummary, filterWords, findWordEntry, getWordContextSentence, isWordSaved, resolveStoredWordForm, savedWordKeys, wordKey } from '../public/js/wordbook.js';

test('同一词形更新而不是重复收藏', () => {
  const first = addOrUpdateWord([], { word: 'study', meaning: '学习', partOfSpeech: 'v.', context: 'I study every day.', savedAt: '2026-10-05' });
  const second = addOrUpdateWord(first, { word: 'Study', meaning: '研究', partOfSpeech: 'n.', context: 'The study is useful.', savedAt: '2026-10-05' });
  assert.equal(second.length, 1);
  assert.equal(second[0].meaning, '研究');
});

test('同一篇来源的原句最多保留最近 10 句，出现次数不受影响', () => {
  // 听力原文一句一段，反复在不同句子里收录同一个词会让这个数组无限增长：
  // 它会被整份写进 data/library.json、也会被导出，所以写入时就要截断。
  let entries = [];
  for (let index = 0; index < 12; index += 1) {
    entries = addOrUpdateWord(entries, {
      word: 'abandon',
      meaning: '放弃',
      partOfSpeech: 'v.',
      context: `Sentence ${index}.`,
      savedAt: '2026-10-11',
      source: { articleId: 'a1', title: '听力原文', count: index + 1 }
    });
  }
  const sentences = entries[0].sources.a1.sentences;
  assert.equal(sentences.length, 10);
  // 丢掉最早的两句，保留最近十句。
  assert.equal(sentences[0], 'Sentence 2.');
  assert.equal(sentences.at(-1), 'Sentence 11.');
  // 出现次数是累计值，不因为原句被截断而变小。
  assert.equal(entries[0].sources.a1.count, 12);
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

test('词形归一化统一走 wordKey', () => {
  assert.equal(wordKey('  Critical '), 'critical');
  assert.equal(wordKey('RUN'), 'run');
  assert.equal(wordKey(undefined), '');
  assert.equal(wordKey(null), '');
  assert.deepEqual([...savedWordKeys([{ word: '  Evidence ' }])], ['evidence']);
  assert.equal(isWordSaved([{ word: '  Evidence ' }], 'evidence'), true);
  assert.equal(resolveStoredWordForm({ word: '  Run ' }, 'running'), 'run');
});

test('同一个词在不同文章里累积出现次数与原句，不重复建条目', () => {
  const first = addOrUpdateWord([], { word: 'critical', meaning: '关键的', context: 'Critical reading matters.', savedAt: '2026-10-09', source: { articleId: 'a1', title: '文章一', count: 2 } });
  const second = addOrUpdateWord(first, { word: 'Critical', meaning: '关键的', context: 'A critical issue appeared.', savedAt: '2026-10-09', source: { articleId: 'a2', title: '文章二', count: 1 } });
  assert.equal(second.length, 1);
  assert.deepEqual(second[0].sources.a1.sentences, ['Critical reading matters.']);
  assert.deepEqual(second[0].sources.a2.sentences, ['A critical issue appeared.']);
  assert.equal(second[0].sources.a1.count, 2);
  assert.equal(second[0].sources.a2.count, 1);
});

test('同一篇重记只刷新次数、句子不重复', () => {
  const first = addOrUpdateWord([], { word: 'critical', context: 'Critical reading matters.', source: { articleId: 'a1', title: '文章一', count: 2 } });
  const second = addOrUpdateWord(first, { word: 'critical', context: 'Critical reading matters.', source: { articleId: 'a1', title: '文章一', count: 5 } });
  assert.equal(second.length, 1);
  assert.equal(second[0].sources.a1.count, 5);
  assert.deepEqual(second[0].sources.a1.sentences, ['Critical reading matters.']);
});

test('旧条目的来源没有 sentences 字段也能继续重记', () => {
  const legacy = [{ word: 'critical', sources: { a1: { title: '文章一', count: 2 } } }];
  const updated = addOrUpdateWord(legacy, { word: 'critical', context: 'A new sentence.', source: { articleId: 'a1', title: '文章一', count: 3 } });
  assert.equal(updated[0].sources.a1.count, 3);
  assert.deepEqual(updated[0].sources.a1.sentences, ['A new sentence.']);
});

test('按词形查找条目', () => {
  const entries = [{ word: 'critical' }, { word: 'evidence' }];
  assert.equal(findWordEntry(entries, '  Critical ')?.word, 'critical');
  assert.equal(findWordEntry(entries, 'missing'), undefined);
  assert.equal(findWordEntry(null, 'critical'), undefined);
});

test('来源列表按次数与标题排序并过滤空句', () => {
  const entry = { sources: {
    a2: { title: 'β 文章', count: 1, sentences: ['b sentence', '', '   '] },
    a1: { title: 'α 文章', count: 3 },
    a3: { title: 'γ 文章', count: 3, sentences: ['c sentence'] }
  } };
  const list = collectWordSources(entry);
  assert.deepEqual(list.map((source) => source.title), ['α 文章', 'γ 文章', 'β 文章']);
  assert.deepEqual(list[0].sentences, []);
  assert.deepEqual(list[2].sentences, ['b sentence']);
});

test('导出的 Markdown 列出每篇来源的原句', () => {
  const markdown = createMarkdown([{
    word: 'critical', meaning: '关键的', partOfSpeech: 'adj.', context: 'latest sentence', savedAt: '2026-10-09',
    sources: {
      a1: { title: '文章一', count: 2, sentences: ['first sentence'] },
      a2: { title: '文章二', count: 1, sentences: ['second sentence'] }
    }
  }], '2026-10-09');
  assert.match(markdown, /- 来源：/);
  assert.match(markdown, /> first sentence/);
  assert.match(markdown, /> second sentence/);
  assert.match(markdown, /> latest sentence/);
});

test('同一篇里用不同原句重记时句子累积', () => {
  const first = addOrUpdateWord([], { word: 'critical', context: 'First sentence.', source: { articleId: 'a1', title: '文章一', count: 1 } });
  const second = addOrUpdateWord(first, { word: 'critical', context: 'Second sentence.', source: { articleId: 'a1', title: '文章一', count: 2 } });
  assert.equal(second.length, 1);
  assert.equal(second[0].sources.a1.count, 2);
  assert.deepEqual(second[0].sources.a1.sentences, ['First sentence.', 'Second sentence.']);
});

test('重记时新条目没带标题就沿用旧标题', () => {
  const first = addOrUpdateWord([], { word: 'critical', context: 'A sentence.', source: { articleId: 'a1', title: '文章一', count: 1 } });
  const second = addOrUpdateWord(first, { word: 'critical', context: 'Another sentence.', source: { articleId: 'a1', count: 2 } });
  assert.equal(second[0].sources.a1.title, '文章一');
});

test('空词形不匹配任何条目', () => {
  assert.equal(findWordEntry([{ word: 'critical' }], ''), undefined);
  assert.equal(findWordEntry([{ word: 'critical' }], '   '), undefined);
  assert.equal(isWordSaved([{ word: 'critical' }], '   '), false);
  // 空查询与空词形条目都不能互相命中，否则库里任一空词形条目会被空查询捡走（findWordEntry 的空值守卫）。
  assert.equal(findWordEntry([{ word: '' }], ''), undefined);
  assert.equal(findWordEntry([{ word: '   ' }], '   '), undefined);
  assert.equal(isWordSaved([{ word: '  ' }], ''), false);
});
