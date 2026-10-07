export function createRequestLock() {
  const pending = new Map();

  function start(key, task) {
    let result;
    try {
      result = task();
    } catch (error) {
      result = Promise.reject(error);
    }
    const promise = Promise.resolve(result).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  }

  return {
    isPending(key) {
      return pending.has(key);
    },

    run(key, task) {
      if (pending.has(key)) return null;
      return start(key, task);
    },

    share(key, task) {
      return pending.get(key) ?? start(key, task);
    }
  };
}
