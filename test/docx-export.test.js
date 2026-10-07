import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createWordbookDocument } from '../server/docx-export.js';
import { createApp } from '../server/app.js';

const entries = [{
  word: 'critical', partOfSpeech: 'adj.', meaning: '关键的；批判性的', context: 'Critical reading matters.',
  phrases: [{ phrase: 'critical thinking', meaning: '批判性思维' }],
  example: { english: 'Think critically.', chinese: '进行批判性思考。' },
  sources: { 'article-1': { title: '批判性阅读', count: 2 } }
}];

test('Word 单词本生成有效的 docx Buffer', async () => {
  const buffer = await createWordbookDocument(entries);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
});

test('Word 导出 API 返回附件', async () => {
  const app = createApp({ translator: { translate: async () => ({}) } });
  const response = await request(app).post('/api/wordbook.docx').send({ entries });

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/vnd\.openxmlformats-officedocument/);
  assert.match(response.headers['content-disposition'], /cet6-wordbook\.docx/);
});
