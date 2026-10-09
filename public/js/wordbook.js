export function addOrUpdateWord(entries, entry) {
  const key = entry.word.toLowerCase();
  const existing = entries.find((item) => item.word.toLowerCase() === key);
  const next = entries.filter((item) => item.word.toLowerCase() !== key);
  const sources = { ...(existing?.sources ?? {}) };
  if (entry.source?.articleId) {
    sources[entry.source.articleId] = {
      title: entry.source.title || '未命名精读文章',
      count: entry.source.count ?? 0,
      recordedAt: new Date().toISOString()
    };
  }
  return [{ ...existing, ...entry, word: key, sources }, ...next];
}

export function savedWordKeys(entries) {
  const keys = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = String(entry?.word ?? '').trim().toLowerCase();
    if (key) keys.add(key);
  }
  return keys;
}

export function isWordSaved(entries, word) {
  const key = String(word ?? '').trim().toLowerCase();
  return Boolean(key) && savedWordKeys(entries).has(key);
}

// 条目实际入库的词形：AI 给出的词元优先，统一小写去空白，落库与界面刷新共用这一处。
export function resolveStoredWordForm(data, fallbackWord) {
  return String(data?.word || fallbackWord || '').trim().toLowerCase();
}

export function createMarkdown(entries, exportedAt) {
  const rows = ['# 六级精读单词本', '', `导出日期：${exportedAt}`, ''];
  for (const item of entries) {
    rows.push(
      `## ${item.word}`,
      '',
      `- 释义：${item.partOfSpeech} ${item.meaning}`,
      `- 收藏日期：${item.savedAt}`,
      `- 来源：${Object.values(item.sources ?? {}).map((source) => `${source.title}（${source.count} 次）`).join('；') || '未关联精读文章'}`,
      '',
      `> ${item.context}`,
      ''
    );
  }
  return rows.join('\n');
}

export function filterWords(entries, { query = '', status = '', tag = '' } = {}) {
  const keyword = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const sources = entry.sources ?? {};
    const searchable = [entry.word, entry.meaning, ...Object.values(sources).map((source) => source.title)].join(' ').toLowerCase();
    const statusMatches = !status || (entry.learningStatus ?? 'unknown') === status;
    const tagMatches = !tag || (entry.importanceTags ?? []).includes(tag);
    return statusMatches && tagMatches && (!keyword || searchable.includes(keyword));
  });
}

export function getWordContextSentence(context, word) {
  const sentences = String(context ?? '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const escaped = String(word ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = sentences.find((sentence) => new RegExp(`\\b${escaped}\\b`, 'i').test(sentence));
  return (found ?? sentences[0] ?? '').trim();
}

export function createWordSummary(entry) {
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  const meaning = entry.meaning || entry.contextMeaning || senses[0]?.meaning || '释义待补全';
  const partOfSpeech = entry.partOfSpeech || senses[0]?.partOfSpeech || '词义';
  const firstPhrase = Array.isArray(entry.phrases) ? entry.phrases.find((item) => item?.phrase) : null;
  return {
    meaning: `${partOfSpeech} · ${meaning}`,
    phrase: firstPhrase ? `${firstPhrase.phrase} · ${firstPhrase.meaning || '释义待补全'}` : '暂无短语，进入详情后生成',
    example: entry.example?.english || getWordContextSentence(entry.context, entry.word)
  };
}
