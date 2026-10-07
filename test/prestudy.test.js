import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESTUDY_TRANSLATION_VERSION, normalizePrestudyTranslation } from '../public/js/prestudy.js';

test('按模型返回的段落索引重排全文译文', () => {
  const paragraphs = ['第一段原文', '第二段原文'];
  const result = normalizePrestudyTranslation({
    translationVersion: PRESTUDY_TRANSLATION_VERSION,
    translation: [
      { paragraphIndex: 1, text: '第二段译文' },
      { paragraphIndex: 0, text: '第一段译文' }
    ]
  }, paragraphs);

  assert.deepEqual(result, ['第一段译文', '第二段译文']);
});

test('拒绝没有段落版本标记的旧字符串数组，避免沿用错位缓存', () => {
  const result = normalizePrestudyTranslation({ translation: ['旧第一段', '旧第二段'] }, ['第一段', '第二段']);
  assert.deepEqual(result, []);
});

test('当前版本允许保留已按段落索引生成的字符串缓存', () => {
  const result = normalizePrestudyTranslation({
    translationVersion: PRESTUDY_TRANSLATION_VERSION,
    translation: ['第一段译文', '第二段译文']
  }, ['第一段', '第二段']);

  assert.deepEqual(result, ['第一段译文', '第二段译文']);
});
