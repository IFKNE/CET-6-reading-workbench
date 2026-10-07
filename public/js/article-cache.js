export function normalizeArticle(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n\n');
}

export function createArticleKey(text) {
  const normalized = normalizeArticle(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function mergeVocabulary(cache, entry) {
  const key = entry.word.toLowerCase();
  return {
    ...cache,
    vocabulary: {
      ...(cache.vocabulary ?? {}),
      [key]: entry
    }
  };
}

export function indexVocabulary(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((index, entry) => {
    if (typeof entry?.word === 'string' && entry.word.trim()) {
      index[entry.word.trim().toLowerCase()] = entry;
    }
    return index;
  }, {});
}

const warmupStopWords = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'than', 'then', 'they', 'their', 'there', 'which', 'while', 'where', 'when', 'what', 'will', 'would', 'could', 'should', 'about', 'after', 'before', 'have', 'has', 'had', 'were', 'been', 'being', 'are', 'was', 'for', 'but', 'not', 'you', 'your', 'our', 'its', 'his', 'her', 'all', 'any', 'can', 'may']);

export function createWarmupBatches(article, vocabulary = {}, { batchSize = 8, maxWords = 40 } = {}) {
  const known = new Set(Object.keys(vocabulary ?? {}).map((word) => word.toLowerCase()));
  const seen = new Set();
  const candidates = [];
  const words = String(article).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  for (const original of words) {
    const word = original.toLowerCase();
    if (word.length < 5 || known.has(word) || seen.has(word) || warmupStopWords.has(word)) continue;
    seen.add(word);
    candidates.push(word);
    if (candidates.length === maxWords) break;
  }
  return Array.from({ length: Math.ceil(candidates.length / batchSize) }, (_, index) => candidates.slice(index * batchSize, (index + 1) * batchSize));
}
