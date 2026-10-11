export function addOrUpdateWord(entries, entry) {
  const key = entry.word.toLowerCase();
  const existing = entries.find((item) => item.word.toLowerCase() === key);
  const next = entries.filter((item) => item.word.toLowerCase() !== key);
  const sources = { ...(existing?.sources ?? {}) };
  if (entry.source?.articleId) {
    const previous = sources[entry.source.articleId] ?? {};
    const sentence = typeof entry.context === 'string' ? entry.context.trim() : '';
    // 同一篇重复收录只刷新次数，不重复记同一句；旧条目没有 sentences 字段时按空数组处理。
    const sentences = (Array.isArray(previous.sentences) ? previous.sentences : [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    if (sentence && !sentences.includes(sentence)) sentences.push(sentence);
    sources[entry.source.articleId] = {
      title: entry.source.title || previous.title || '未命名精读文章',
      count: entry.source.count ?? previous.count ?? 0,
      recordedAt: new Date().toISOString(),
      sentences
    };
  }
  return [{ ...existing, ...entry, word: key, sources }, ...next];
}

// 词形归一化的唯一入口：库里比较、界面比较、入库词形都走这里。
export function wordKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

// 按词形查条目：面板三态、详情页都要用它，避免各处重复写 find + 归一化。
export function findWordEntry(entries, word) {
  const key = wordKey(word);
  if (!key) return undefined;
  return (Array.isArray(entries) ? entries : []).find((entry) => wordKey(entry?.word) === key);
}

export function savedWordKeys(entries) {
  const keys = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = wordKey(entry?.word);
    if (key) keys.add(key);
  }
  return keys;
}

export function isWordSaved(entries, word) {
  return Boolean(findWordEntry(entries, word));
}

// 条目实际入库的词形：AI 给出的词元优先，统一小写去空白，落库与界面刷新共用这一处。
export function resolveStoredWordForm(data, fallbackWord) {
  return wordKey(data?.word || fallbackWord);
}

// 按篇汇总来源：每篇的出现次数与该篇累积的原句（按次数降序、标题升序）。
export function collectWordSources(entry) {
  return Object.entries(entry?.sources ?? {})
    .map(([articleId, source]) => ({
      articleId,
      title: String(source?.title ?? '未命名精读文章'),
      count: Number(source?.count ?? 0),
      sentences: (Array.isArray(source?.sentences) ? source.sentences : [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    }))
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, 'zh-CN'));
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
      ''
    );
    // 每篇来源下补该篇累积的原句，旧条目没有句子时只保留上面那行。
    for (const source of collectWordSources(item)) {
      if (!source.sentences.length) continue;
      rows.push(`### ${source.title}（${source.count} 次）`, '');
      source.sentences.forEach((sentence) => rows.push(`> ${sentence}`));
      rows.push('');
    }
    rows.push(`> ${item.context}`, '');
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
