import express from 'express';
import path from 'node:path';
import { createWordbookDocument } from './docx-export.js';
import { createStore } from './store.js';

const validScopes = new Set(['word', 'word-batch', 'phrase', 'sentence', 'paragraph', 'question', 'prestudy']);

// id 取自路径：为空直接 400，并让调用方知道响应已经写过。
function readIdParam(req, res) {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    res.status(400).json({ error: 'id 不能为空。' });
    return null;
  }
  return id;
}

export function createApp({ translator, store = createStore() }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/translate', async (req, res) => {
    const { scope, text, context = '' } = req.body ?? {};
    if (!validScopes.has(scope)) {
      return res.status(400).json({ error: 'scope 必须是 word、word-batch、phrase、sentence、paragraph、question 或 prestudy。' });
    }
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 10000) {
      return res.status(400).json({ error: 'text 必须是 1 至 10000 个字符。' });
    }
    if (typeof context !== 'string') {
      return res.status(400).json({ error: 'context 必须是文本。' });
    }

    try {
      const result = await translator.translate({
        scope,
        text: text.trim(),
        context: context.slice(0, scope === 'question' ? 10000 : 2000)
      });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode ?? 502).json({ error: error.message || '翻译服务暂时不可用。' });
    }
  });

  app.post('/api/wordbook.docx', async (req, res) => {
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries 必须是数组。' });
    try {
      const buffer = await createWordbookDocument(entries);
      res.attachment('cet6-wordbook.docx');
      return res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buffer);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Word 文档生成失败。' });
    }
  });

  app.get('/api/library', async (req, res) => {
    try {
      const [articles, folders] = await Promise.all([store.listArticles(), store.listFolders()]);
      return res.json({ articles, folders });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章库读取失败。' });
    }
  });

  app.put('/api/library/articles/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    const article = req.body ?? {};
    if (article.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof article.article !== 'string' || article.article.trim().length === 0) {
      return res.status(400).json({ error: 'article 必须是非空文本。' });
    }
    if (article.article.length > 100000) return res.status(400).json({ error: 'article 不能超过 100000 个字符。' });
    try {
      return res.json({ article: await store.putArticle(article) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章保存失败。' });
    }
  });

  app.delete('/api/library/articles/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    try {
      const { removed } = await store.deleteArticle(id);
      return res.json({ ok: true, removed });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文章删除失败。' });
    }
  });

  app.put('/api/library/folders/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    const folder = req.body ?? {};
    if (folder.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof folder.name !== 'string' || folder.name.trim().length === 0) {
      return res.status(400).json({ error: 'name 必须是非空文本。' });
    }
    try {
      return res.json({ folder: await store.putFolder(folder) });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文件夹保存失败。' });
    }
  });

  app.delete('/api/library/folders/:id', async (req, res) => {
    const id = readIdParam(req, res);
    if (!id) return;
    try {
      const { detached } = await store.deleteFolder(id);
      return res.json({ ok: true, detached });
    } catch (error) {
      return res.status(500).json({ error: error.message || '文件夹删除失败。' });
    }
  });

  app.use(express.static(path.join(process.cwd(), 'public')));
  return app;
}
