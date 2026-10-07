import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTheme, readTheme } from '../public/js/theme.js';

test('主题只接受浅色或暗色，并可在两者间切换', () => {
  assert.equal(readTheme('dark'), 'dark');
  assert.equal(readTheme('unknown'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
});
