import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../server/prompts.js';
import { splitParagraphs } from '../public/js/text.js';

test('单词任务要求按词性和常见度返回 JSON', () => {
  const messages = buildMessages({ scope: 'word', text: 'address', context: 'Please address the issue.' });
  assert.match(messages[0].content, /最高频/);
  assert.match(messages[0].content, /partOfSpeech/);
  assert.match(messages[1].content, /Please address the issue/);
  assert.match(messages[0].content, /wordFormation/);
  assert.match(messages[0].content, /confusables/);
  assert.match(messages[0].content, /importanceTags/);
  assert.match(messages[0].content, /phrases/);
  assert.match(messages[0].content, /example/);
  assert.match(messages[0].content, /同义词/);
});

test('段落任务要求自然中文译文', () => {
  const messages = buildMessages({ scope: 'paragraph', text: 'Reading improves critical thinking.' });
  assert.match(messages[0].content, /自然、准确的中文/);
  assert.match(messages[1].content, /Reading improves/);
});

test('全文问答携带文章与问题，并要求结合全文回答', () => {
  const messages = buildMessages({
    scope: 'question',
    text: '作者的核心观点是什么？',
    context: 'Reading critically improves judgment.'
  });
  assert.match(messages[0].content, /结合全文/);
  assert.match(messages[1].content, /文章全文：Reading critically/);
  assert.match(messages[1].content, /问题：作者的核心观点是什么？/);
});

test('预研读要求全文译文、重点词、短语和例句 JSON', () => {
  const messages = buildMessages({ scope: 'prestudy', text: 'Critical reading improves judgment.' });
  assert.match(messages[0].content, /全文译文/);
  assert.match(messages[0].content, /"title"/);
  assert.match(messages[0].content, /translationVersion/);
  assert.match(messages[0].content, /paragraphIndex/);
  assert.match(messages[1].content, /段落 0/);
  assert.match(messages[0].content, /大学英语六级/);
  assert.match(messages[0].content, /常考搭配/);
  assert.match(messages[0].content, /phrases/);
  assert.match(messages[0].content, /example/);
});

test('预研读提示词的段落编号与前端分段函数完全一致', () => {
  const transcript = [
    'Conversation One',
    'Questions 1 to 4 are based on the conversation you have just heard.',
    'M: Good morning. I am calling about the apartment you advertised online.',
    'W: Oh, yes. It is still available. Would you like to come and see it?'
  ].join('\n');
  const paragraphs = splitParagraphs(transcript);
  assert.ok(paragraphs.length > 1, '听力原文必须拆成多段');
  const expected = paragraphs.map((paragraph, index) => `段落 ${index}：\n${paragraph}`).join('\n\n');

  const messages = buildMessages({ scope: 'prestudy', text: transcript });

  assert.ok(messages[1].content.includes(expected), '服务端必须使用与前端相同的分段结果');
});
