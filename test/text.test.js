import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraphs, tokenizeParagraph, classifySelection } from '../public/js/text.js';

test('保留非空段落并剔除首尾空白', () => {
  assert.deepEqual(splitParagraphs('  First line.\n\n Second line.  '), ['First line.', 'Second line.']);
});

test('英文单词保持标点顺序且可单独点击', () => {
  assert.deepEqual(tokenizeParagraph("Don't stop, readers!"), ["Don't", ' ', 'stop', ',', ' ', 'readers', '!']);
});

test('根据标点判断句子和短语', () => {
  assert.equal(classifySelection('A complete sentence.').scope, 'sentence');
  assert.equal(classifySelection('in the long run').scope, 'phrase');
});
