import { buildMessages } from './prompts.js';

function stripCodeFence(content) {
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function createDeepSeekClient({ apiKey, fetchImpl = fetch }) {
  return {
    async translate(input) {
      const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-flash',
          temperature: 0.2,
          messages: buildMessages(input)
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek 请求失败（状态码：${response.status}）`);
      }

      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('DeepSeek 未返回可用内容，请重试。');
      }

      if (input.scope === 'word') {
        try {
          return { kind: 'word', data: JSON.parse(stripCodeFence(content)) };
        } catch {
          throw new Error('单词释义格式异常，请重试。');
        }
      }

      if (input.scope === 'word-batch') {
        try {
          const data = JSON.parse(stripCodeFence(content));
          return { kind: 'word-batch', data: { vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary : [] } };
        } catch {
          throw new Error('批量单词释义格式异常，请重试。');
        }
      }

      if (input.scope === 'prestudy') {
        try {
          return { kind: 'prestudy', data: JSON.parse(stripCodeFence(content)) };
        } catch {
          throw new Error('预研读结果格式异常，请重试。');
        }
      }

      if (input.scope === 'question') {
        return { kind: 'answer', answer: content.trim() };
      }

      return { kind: 'translation', translation: content.trim() };
    }
  };
}
