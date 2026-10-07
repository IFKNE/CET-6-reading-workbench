import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../server/prompts.js';

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
