import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraphs, tokenizeParagraph, classifySelection } from '../public/js/text.js';

test('保留非空段落并剔除首尾空白', () => {
  assert.deepEqual(splitParagraphs('  First line.\n\n Second line.  '), ['First line.', 'Second line.']);
});

test('只有空白的行同样起到分段作用', () => {
  assert.deepEqual(splitParagraphs('First line.\n   \nSecond line.'), ['First line.', 'Second line.']);
});

test('沿用空行分段的老文章分段结果不变', () => {
  // 老文章按段落缓存译文与小记，分段结果必须与旧规则逐段一致，否则译文会错位。
  const article = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
  const legacyParagraphs = article.split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean);
  assert.deepEqual(splitParagraphs(article), legacyParagraphs);
});

test('Windows 换行与旧式回车换行都能逐行分段', () => {
  assert.deepEqual(splitParagraphs('Conversation One\r\nW: Hello.\rM: Hi.'), ['Conversation One', 'W: Hello.', 'M: Hi.']);
});

const listeningTranscript = [
  'Conversation One',
  'Questions 1 to 4 are based on the conversation you have just heard.',
  'M: Good morning. I am calling about the apartment you advertised online.',
  'W: Oh, yes. It is still available. Would you like to come and see it?',
  'M: That would be great. Is it within walking distance of the subway station?',
  'W: It is about ten minutes on foot, and there is a bus stop right outside.'
].join('\n');

test('听力原文的每句对话各自成段', () => {
  assert.deepEqual(splitParagraphs(listeningTranscript), listeningTranscript.split('\n'));
});

test('听力题号、题干与选项逐行成段', () => {
  const questionBlock = [
    '1. A) He is a teacher at a local high school.',
    'B) He is a doctor working in a city hospital.',
    'C) He is a journalist for a national newspaper.',
    'D) He is an engineer in a technology company.',
    '2. What does the woman suggest the man should do?',
    'A) Apply for a part-time job on campus.',
    'B) Move to a quieter apartment near the library.'
  ].join('\n');

  assert.deepEqual(splitParagraphs(questionBlock), questionBlock.split('\n'));
});

test('说话人标记开头的行不会被并进上一段', () => {
  const dialogue = 'W: The train leaves at nine.\nMan: Then we still have time.\nQuestion 5: What time does the train leave?';
  assert.deepEqual(splitParagraphs(dialogue), dialogue.split('\n'));
});

test('排版折行的一段文字仍合并为一段', () => {
  const wrappedParagraph = [
    'Critical reading is a skill that every college student needs to develop',
    'in order to deal with the enormous amount of information available',
    'today. It helps readers separate evidence from opinion.'
  ].join('\n');

  assert.deepEqual(splitParagraphs(wrappedParagraph), [
    'Critical reading is a skill that every college student needs to develop in order to deal with the enormous amount of information available today. It helps readers separate evidence from opinion.'
  ]);
});

test('折行只发生在同一段落内部，段落之间仍保持分段', () => {
  const twoWrappedParagraphs = [
    'Critical reading is a skill that every college student needs to develop',
    'in order to deal with the amount of information available.',
    'Mindless reading fills the same hours without asking what the writer',
    'is trying to prove or how the evidence was collected.'
  ].join('\n');

  assert.deepEqual(splitParagraphs(twoWrappedParagraphs), [
    'Critical reading is a skill that every college student needs to develop in order to deal with the amount of information available.',
    'Mindless reading fills the same hours without asking what the writer is trying to prove or how the evidence was collected.'
  ]);
});

test('每行都是完整句子的长文本不会被误判为折行', () => {
  const sentenceLines = [
    'The ability to read critically has become increasingly important in a world full of information.',
    'Critical reading does not mean reading with suspicion alone, but asking useful questions.',
    'Good readers notice the assumptions that a writer never states openly in the text.'
  ].join('\n');

  assert.deepEqual(splitParagraphs(sentenceLines), sentenceLines.split('\n'));
});

test('超出排版宽度的长行不按折行处理', () => {
  const longLines = [
    'The lecture explained how modern readers often mistake speed for understanding and why that habit quietly costs them the ability to notice the assumptions hidden inside a carefully written argument about climate policy and public money',
    'A second paragraph of the same length that also runs past any realistic typeset line width and therefore cannot be a wrapped line of the previous sentence about climate policy'
  ].join('\n');

  assert.deepEqual(splitParagraphs(longLines), longLines.split('\n'));
});

test('同一段对话内部的折行会合并，下一句对话仍另起一段', () => {
  const wrappedDialogue = [
    'M: I have been looking for a quiet apartment near the campus for almost',
    'three months now, but the rent keeps going up every single year.',
    'W: I know what you mean. The rooms near the library are the worst.'
  ].join('\n');

  assert.deepEqual(splitParagraphs(wrappedDialogue), [
    'M: I have been looking for a quiet apartment near the campus for almost three months now, but the rent keeps going up every single year.',
    'W: I know what you mean. The rooms near the library are the worst.'
  ]);
});

test('英文单词保持标点顺序且可单独点击', () => {
  assert.deepEqual(tokenizeParagraph("Don't stop, readers!"), ["Don't", ' ', 'stop', ',', ' ', 'readers', '!']);
});

test('根据标点判断句子和短语', () => {
  assert.equal(classifySelection('A complete sentence.').scope, 'sentence');
  assert.equal(classifySelection('in the long run').scope, 'phrase');
});
