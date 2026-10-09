import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewBack } from '../public/js/view-nav.js';

test('从原文进入的单词详情返回原文', () => {
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: 'reader', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
});

test('从单词本进入的单词详情返回单词本', () => {
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: 'wordbook', hasArticle: true }), { view: 'wordbook', label: '← 返回单词本' });
});

test('单词本返回来时的视图', () => {
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'reader', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'library', hasArticle: true }), { view: 'library', label: '← 返回我的精读' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'paste', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'word-detail', hasArticle: true }), { view: 'word-detail', label: '← 返回单词详情' });
});

test('没有来源记录时按是否有文章兜底', () => {
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: '', hasArticle: true }), { view: 'reader', label: '← 返回原文' });
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: '', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
  assert.deepEqual(resolveViewBack({ view: 'word-detail', origin: '', hasArticle: false }), { view: 'paste', label: '← 返回文章输入' });
});

test('返回的目标对象不会被调用方修改污染', () => {
  const first = resolveViewBack({ view: 'wordbook', origin: 'library', hasArticle: true });
  first.view = '篡改';
  first.label = '篡改';
  assert.deepEqual(resolveViewBack({ view: 'wordbook', origin: 'library', hasArticle: true }), { view: 'library', label: '← 返回我的精读' });
});
