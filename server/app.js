import express from 'express';
import path from 'node:path';
import { createWordbookDocument } from './docx-export.js';
import { createStore } from './store.js';

const validScopes = new Set(['word', 'word-batch', 'phrase', 'sentence', 'paragraph', 'question', 'prestudy']);
const MAX_ARTICLE_LENGTH = 100000;

// 全文件唯一的「异常 → 状态码」规则：错误自带 statusCode 就用它，否则回落到调用方给的兜底值。
// 目前的产出方：server/index.js 缺 Key 时挂 503、server/store.js 参数守卫挂 400。
// 不按 instanceof TypeError 猜——fetch 的网络故障（TypeError: fetch failed）也是 TypeError，
// 猜错会把上游故障报成 400（这条有 test/deepseek.test.js 的「翻译上游网络故障按 502 返回」钉住）。
function statusForError(error, fallback) {
  return error?.statusCode ?? fallback;
}

const WORD_REQUIRED_MESSAGE = '每个单词条目的 word 必须是非空文本。';

// find() 返回的是「匹配到的元素」，元素本身是 null 时是假值，
// 所以调用方必须判 `!== undefined`，不能写成 `if (found)`。
function firstInvalidWordEntry(entries) {
  return entries.find((entry) => typeof entry?.word !== 'string' || entry.word.trim().length === 0);
}

// 名字里写明 OrRespond：它失败时自己就把 400 写进响应了，
// 所以调用点必须立刻 return —— 叫 readIdParam 会让人以为它只是取值。
function readIdParamOrRespond(req, res) {
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
      return res.status(statusForError(error, 502)).json({ error: error.message || '翻译服务暂时不可用。' });
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
      return res.status(statusForError(error, 500)).json({ error: error.message || 'Word 文档生成失败。' });
    }
  });

  app.get('/api/library', async (req, res) => {
    try {
      const [articles, folders] = await Promise.all([store.listArticles(), store.listFolders()]);
      return res.json({ articles, folders });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '文章库读取失败。' });
    }
  });

  app.put('/api/library/articles/:id', async (req, res) => {
    const id = readIdParamOrRespond(req, res);
    if (!id) return;
    const article = req.body ?? {};
    if (article.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof article.article !== 'string' || article.article.trim().length === 0) {
      return res.status(400).json({ error: 'article 必须是非空文本。' });
    }
    if (article.article.length > MAX_ARTICLE_LENGTH) return res.status(400).json({ error: `article 不能超过 ${MAX_ARTICLE_LENGTH} 个字符。` });
    try {
      return res.json({ article: await store.putArticle(article) });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '文章保存失败。' });
    }
  });

  app.delete('/api/library/articles/:id', async (req, res) => {
    const id = readIdParamOrRespond(req, res);
    if (!id) return;
    try {
      const { removed } = await store.deleteArticle(id);
      return res.json({ ok: true, removed });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '文章删除失败。' });
    }
  });

  app.put('/api/library/folders/:id', async (req, res) => {
    const id = readIdParamOrRespond(req, res);
    if (!id) return;
    const folder = req.body ?? {};
    if (folder.id !== id) return res.status(400).json({ error: 'body.id 必须与地址里的 id 一致。' });
    if (typeof folder.name !== 'string' || folder.name.trim().length === 0) {
      return res.status(400).json({ error: 'name 必须是非空文本。' });
    }
    try {
      return res.json({ folder: await store.putFolder(folder) });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '文件夹保存失败。' });
    }
  });

  app.delete('/api/library/folders/:id', async (req, res) => {
    const id = readIdParamOrRespond(req, res);
    if (!id) return;
    try {
      const { detached } = await store.deleteFolder(id);
      return res.json({ ok: true, detached });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '文件夹删除失败。' });
    }
  });

  app.get('/api/wordbook', async (req, res) => {
    try {
      return res.json({ entries: await store.getWordbook() });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '单词本读取失败。' });
    }
  });

  app.put('/api/wordbook', async (req, res) => {
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries 必须是数组。' });
    if (firstInvalidWordEntry(entries) !== undefined) return res.status(400).json({ error: WORD_REQUIRED_MESSAGE });
    try {
      return res.json({ ok: true, saved: await store.putWordbook(entries) });
    } catch (error) {
      return res.status(statusForError(error, 500)).json({ error: error.message || '单词本保存失败。' });
    }
  });

  app.post('/api/library/import', async (req, res) => {
    const { articles = [], folders = [], wordbook = [] } = req.body ?? {};
    for (const [name, value] of [['articles', articles], ['folders', folders], ['wordbook', wordbook]]) {
      if (!Array.isArray(value)) return res.status(400).json({ error: `${name} 必须是数组。` });
    }
    // 与 PUT /api/wordbook 同一条规则：空白词形不许进库。
    if (firstInvalidWordEntry(wordbook) !== undefined) return res.status(400).json({ error: WORD_REQUIRED_MESSAGE });
    try {
      return res.json({ imported: await store.importAll({ articles, folders, wordbook }) });
    } catch (error) {
      // 存储层参数守卫挂的是 statusCode = 400，statusForError 会据此回 400，
      // 别让客户端收到一个带 400 文案的 500。
      return res.status(statusForError(error, 500)).json({ error: error.message || '数据迁移失败。' });
    }
  });

  app.use(express.static(path.join(process.cwd(), 'public')));
  return app;
}
