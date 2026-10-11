import fs from 'node:fs/promises';
import path from 'node:path';

// 单一 JSON 文档：单人单机数据量很小，换来的是可直接阅读、可直接备份的文件。
function emptyDocument() {
  return { version: 1, articles: [], folders: [], wordbook: [] };
}

// 形状不对时与 JSON 语法错误同等处理：宁可服务报错，也不让一份半截文件变成空库。
function corrupt(filePath, detail, cause) {
  const suffix = detail ? `（${detail}）` : '';
  return new Error(`文章库文件无法解析：${filePath}${suffix}。请先备份该文件，再修复或删除它后重启服务。`, { cause });
}

function normalizeDocument(parsed, filePath) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupt(filePath, '根节点必须是对象');
  }
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw corrupt(filePath, `不支持的文档版本 ${String(parsed.version)}`);
  }
  for (const field of ['articles', 'folders', 'wordbook']) {
    if (parsed[field] !== undefined && !Array.isArray(parsed[field])) {
      throw corrupt(filePath, `${field} 必须是数组`);
    }
  }
  return { ...emptyDocument(), articles: parsed.articles ?? [], folders: parsed.folders ?? [], wordbook: parsed.wordbook ?? [] };
}

export function createStore({ dataDir = process.env.DATA_DIR || './data', now = () => new Date().toISOString() } = {}) {
  const filePath = path.join(dataDir, 'library.json');
  let document = null;
  let writeChain = Promise.resolve();

  async function load() {
    if (document) return document;
    try {
      document = normalizeDocument(JSON.parse(await fs.readFile(filePath, 'utf8')), filePath);
    } catch (error) {
      if (error.code === 'ENOENT') document = emptyDocument();
      else if (error instanceof SyntaxError) throw corrupt(filePath, error.message, error);
      else throw error;
    }
    return document;
  }

  async function persist(target) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, filePath);
  }

  // 写操作串行化，并且「先写副本、落盘成功后才推进内存」：
  // 若先改内存再落盘，一旦落盘失败，内存就领先于磁盘——调用方收到的是失败，
  // 而后续任何一次成功写入都会把这次被判定失败的改动悄悄带上盘。
  function mutate(action) {
    const next = writeChain.catch(() => {}).then(async () => {
      const draft = structuredClone(await load());
      const result = action(draft);
      await persist(draft);
      document = draft;
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
        return structuredClone(record);
      });
    },
    deleteArticle(id) {
      return mutate((current) => {
        const before = current.articles.length;
        current.articles = current.articles.filter((article) => article.id !== id);
        return { removed: before - current.articles.length };
      });
    },
    putFolder(folder) {
      return mutate((current) => {
        const record = structuredClone(folder);
        const index = current.folders.findIndex((item) => item.id === folder.id);
        if (index === -1) current.folders.push(record);
        else current.folders[index] = record;
        return structuredClone(record);
      });
    },
    deleteFolder(id) {
      // 空 id 会让「未归档」（folderId === ''）的文章全部被误判成成员。
      if (!id) return Promise.resolve({ detached: 0 });
      return mutate((current) => {
        current.folders = current.folders.filter((folder) => folder.id !== id);
        const stamp = now();
        let detached = 0;
        current.articles = current.articles.map((article) => {
          if (article.folderId !== id) return article;
          detached += 1;
          return { ...article, folderId: '', updatedAt: stamp };
        });
        return { detached };
      });
    },
    putWordbook(entries) {
      // 非数组必须在落盘前拒绝：一旦写成 {"wordbook": "hello"}，normalizeDocument 之后
      // 每一次读取都会判定文档损坏，整库要手工修文件才能再打开。
      // 返回 rejected Promise（而非同步 throw），与其它成员的 await 调用方式保持一致。
      if (!Array.isArray(entries)) return Promise.reject(new TypeError('entries 必须是数组。'));
      return mutate((current) => {
        current.wordbook = structuredClone(entries);
        return current.wordbook.length;
      });
    },
    importAll({ articles = [], folders = [], wordbook = [] } = {}) {
      // 与 putWordbook 同一条理由：参数不是数组就拒绝，别把字符串当数组遍历后写进库。
      for (const [name, value] of [['articles', articles], ['folders', folders], ['wordbook', wordbook]]) {
        if (!Array.isArray(value)) return Promise.reject(new TypeError(`${name} 必须是数组。`));
      }
      return mutate((current) => {
        let importedArticles = 0;
        let importedFolders = 0;
        let importedWordbook = 0;

        for (const folder of folders) {
          const record = structuredClone(folder);
          const index = current.folders.findIndex((item) => item.id === folder.id);
          if (index === -1) current.folders.push(record);
          else current.folders[index] = record;
          // 三个计数都是「真正落库的条数」，而不是入参长度：
          // 否则重复点迁移按钮会永远返回非 0，调用方无法判断这次到底有没有改动。
          importedFolders += 1;
        }

        for (const article of articles) {
          const record = structuredClone(article);
          const index = current.articles.findIndex((item) => item.id === article.id);
          if (index === -1) {
            current.articles.push(record);
            importedArticles += 1;
            continue;
          }
          // 冲突时以 updatedAt 较新者为准，避免本机旧数据覆盖服务器上的新编辑。
          const existing = current.articles[index];
          if (String(article.updatedAt ?? '').localeCompare(String(existing.updatedAt ?? '')) > 0) {
            current.articles[index] = record;
            importedArticles += 1;
          }
        }

        const known = new Set(current.wordbook.map((entry) => String(entry?.word ?? '').toLowerCase()));
        for (const entry of wordbook) {
          const key = String(entry?.word ?? '').toLowerCase();
          // 同词条目保留服务器版本：它可能带着学习状态、标签与已生成档案，比本机旧释义更值钱。
          if (!key || known.has(key)) continue;
          known.add(key);
          current.wordbook.push(structuredClone(entry));
          importedWordbook += 1;
        }

        return { articles: importedArticles, folders: importedFolders, wordbook: importedWordbook };
      });
    }
  };
}
