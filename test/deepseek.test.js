import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createDeepSeekClient } from '../server/deepseek.js';
import { createApp } from '../server/app.js';

test('单词结果移除 Markdown 代码围栏并解析 JSON', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"word":"address","senses":[]}\n```' } }]
    }), { status: 200 })
  });
  const result = await client.translate({ scope: 'word', text: 'address', context: '' });
  assert.equal(result.kind, 'word');
  assert.equal(result.data.word, 'address');
});

test('上游失败转换为带状态码的错误', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    fetchImpl: async () => new Response('额度不足', { status: 429 })
  });
  await assert.rejects(
    () => client.translate({ scope: 'phrase', text: 'in fact' }),
    { message: /DeepSeek 请求失败/ }
  );
});

test('无效 scope 返回 400 而不调用翻译客户端', async () => {
  const app = createApp({ translator: { translate: async () => { throw new Error('不应调用'); } } });
  const response = await request(app).post('/api/translate').send({ scope: 'page', text: 'hello' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /scope/);
});

test('全文问答 scope 可通过本机 API', async () => {
  const app = createApp({ translator: { translate: async (input) => ({ kind: 'answer', answer: input.text }) } });
  const response = await request(app).post('/api/translate').send({
    scope: 'question',
    text: '作者观点？',
    context: '文章全文'
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.kind, 'answer');
});

test('预研读结果解析为缓存数据', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"title":"批判性阅读","translation":["批判性阅读能改善判断力。"],"vocabulary":[]}' } }]
    }), { status: 200 })
  });
  const result = await client.translate({ scope: 'prestudy', text: 'Critical reading improves judgment.' });
  assert.equal(result.kind, 'prestudy');
  assert.equal(result.data.title, '批判性阅读');
  assert.equal(result.data.translation[0], '批判性阅读能改善判断力。');
});

test('预研读 scope 可通过本机 API', async () => {
  const app = createApp({ translator: { translate: async () => ({ kind: 'prestudy', data: { translation: [], vocabulary: [] } }) } });
  const response = await request(app).post('/api/translate').send({ scope: 'prestudy', text: 'A short article.' });
  assert.equal(response.status, 200);
  assert.equal(response.body.kind, 'prestudy');
});

test('批量单词预热解析为词条数组并可通过本机 API', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"vocabulary":[{"word":"analysis","contextMeaning":"分析"}]}' } }]
    }), { status: 200 })
  });
  const result = await client.translate({ scope: 'word-batch', text: 'analysis\nevidence', context: 'Academic analysis needs evidence.' });
  assert.equal(result.kind, 'word-batch');
  assert.equal(result.data.vocabulary[0].word, 'analysis');

  const app = createApp({ translator: { translate: async () => ({ kind: 'word-batch', data: { vocabulary: [] } }) } });
  const response = await request(app).post('/api/translate').send({ scope: 'word-batch', text: 'analysis\nevidence', context: 'Academic analysis.' });
  assert.equal(response.status, 200);
  assert.equal(response.body.kind, 'word-batch');
});

test('翻译上游网络故障按 502 返回而不是 400', async () => {
  // 复核发现：这个回归曾无测试覆盖——把 statusForError 改回 instanceof TypeError → 400，
  // 132 个测试照样全绿。这条测试就是用来钉住它的。
  const app = createApp({ translator: { translate: async () => { throw new TypeError('fetch failed'); } } });
  const response = await request(app).post('/api/translate').send({ scope: 'phrase', text: 'in fact' });
  assert.equal(response.status, 502);
});
