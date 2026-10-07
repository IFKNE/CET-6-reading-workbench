import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestLock } from '../public/js/request-lock.js';

test('同一请求进行中只允许启动一次', async () => {
  const lock = createRequestLock();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });

  const first = lock.run('word:critical', async () => {
    calls += 1;
    await pending;
    return 'done';
  });
  const duplicate = lock.run('word:critical', async () => {
    calls += 1;
    return 'duplicate';
  });

  assert.equal(lock.isPending('word:critical'), true);
  assert.equal(duplicate, null);
  assert.equal(calls, 1);

  release();
  assert.equal(await first, 'done');
  assert.equal(lock.isPending('word:critical'), false);
});

test('失败后释放请求锁，允许用户重试', async () => {
  const lock = createRequestLock();

  await assert.rejects(lock.run('word:evidence', async () => {
    throw new Error('network');
  }), /network/);

  const retry = lock.run('word:evidence', async () => 'retried');
  assert.equal(await retry, 'retried');
});

test('共享请求复用同一个 Promise 而不重复执行任务', async () => {
  const lock = createRequestLock();
  let calls = 0;
  const task = async () => {
    calls += 1;
    return 'shared';
  };

  const first = lock.share('lookup:critical', task);
  const second = lock.share('lookup:critical', task);

  assert.equal(first, second);
  assert.equal(await second, 'shared');
  assert.equal(calls, 1);
});
