import fs from 'node:fs/promises';
import path from 'node:path';

// 单一 JSON 文档：单人单机数据量很小，换来的是可直接阅读、可直接备份的文件。
function emptyDocument() {
  return { version: 1, articles: [], folders: [], wordbook: [] };
}

export function createStore({ dataDir = process.env.DATA_DIR || './data', now = () => new Date().toISOString() } = {}) {
  const filePath = path.join(dataDir, 'library.json');
  let document = null;
  let writeChain = Promise.resolve();

  async function load() {
    if (document) return document;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      document = {
        version: 1,
        articles: Array.isArray(parsed?.articles) ? parsed.articles : [],
        folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
        wordbook: Array.isArray(parsed?.wordbook) ? parsed.wordbook : []
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        document = emptyDocument();
      } else if (error instanceof SyntaxError) {
        // 数据安全优先：宁可服务报错，也用空文档覆盖用户已有数据这种事绝不发生。
        throw new Error(`文章库文件无法解析：${filePath}。请先备份该文件，再修复或删除它后重启服务。`);
      } else {
        throw error;
      }
    }
    return document;
  }

  async function persist() {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, filePath);
  }

  // 所有写操作串行化：前一次失败也不能让后面的写入卡在 rejected 的 Promise 上。
  function mutate(action) {
    const next = writeChain.catch(() => {}).then(async () => {
      const current = await load();
      const result = action(current);
      await persist();
      return result;
    });
    writeChain = next;
    return next;
  }

  async function snapshot() {
    return structuredClone(await load());
  }

  return {
    filePath,
    async listArticles() {
      return (await snapshot()).articles;
    },
    async listFolders() {
      return (await snapshot()).folders;
    },
    async getArticle(id) {
      return (await snapshot()).articles.find((article) => article.id === id);
    },
    async getWordbook() {
      return (await snapshot()).wordbook;
    },
    putArticle(article) {
      return mutate((current) => {
        const record = structuredClone(article);
        const index = current.articles.findIndex((item) => item.id === article.id);
        if (index === -1) current.articles.push(record);
        else current.articles[index] = record;
        return record;
      });
    },
    deleteArticle(id) {
      return mutate((current) => {
        const before = current.articles.length;
        current.articles = current.articles.filter((article) => article.id !== id);
        return { removed: before - current.articles.length };
      });
    }
  };
}
