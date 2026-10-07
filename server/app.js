import express from 'express';
import path from 'node:path';
import { createWordbookDocument } from './docx-export.js';

const validScopes = new Set(['word', 'word-batch', 'phrase', 'sentence', 'paragraph', 'question', 'prestudy']);

export function createApp({ translator }) {
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

  app.use(express.static(path.join(process.cwd(), 'public')));
  return app;
}
