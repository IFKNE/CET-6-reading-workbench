import { createArticleKey } from './article-cache.js';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `article-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countWordInArticle(article, word) {
  if (!article || !word) return 0;
  const matches = String(article).match(new RegExp(`\\b${escapeRegExp(String(word))}\\b`, 'gi'));
  return matches?.length ?? 0;
}

export function createArticleRecord({ id, article, category, folderId, prestudy, highlights, notes, createdAt }) {
  const now = new Date().toISOString();
  return {
    id: id ?? createId(),
    article,
    category: category || '短篇阅读',
    folderId: folderId || '',
    title: prestudy?.title || '未命名精读文章',
    translationVersion: prestudy?.translationVersion ?? null,
    translation: Array.isArray(prestudy?.translation) ? prestudy.translation : [],
    vocabulary: prestudy?.vocabulary ?? {},
    highlights: [...new Set(highlights ?? [])],
    notes: notes && typeof notes === 'object' ? notes : {},
    createdAt: createdAt ?? now,
    updatedAt: now
  };
}

export function restoreArticleState(record) {
  return {
    articleId: record.id,
    article: record.article,
    category: record.category || '短篇阅读',
    folderId: record.folderId || '',
    highlights: record.highlights ?? [],
    notes: record.notes && typeof record.notes === 'object' ? record.notes : {},
    prestudy: {
      articleKey: '',
      title: record.title || '未命名精读文章',
      translationVersion: record.translationVersion ?? null,
      translation: record.translation ?? [],
      vocabulary: record.vocabulary ?? {},
      createdAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString()
    }
  };
}

export function updateArticleMetadata(record, { title, category, folderId }) {
  return {
    ...record,
    title: typeof title === 'string' && title.trim() ? title.trim() : record.title,
    category: typeof category === 'string' && category.trim() ? category.trim() : record.category,
    folderId: typeof folderId === 'string' ? folderId : (record.folderId || ''),
    updatedAt: new Date().toISOString()
  };
}

export function dedupeArticles(records) {
  const newestByArticle = new Map();
  for (const record of records) {
    const key = createArticleKey(record.article || '');
    const existing = newestByArticle.get(key);
    if (!existing || String(record.updatedAt).localeCompare(String(existing.updatedAt)) > 0) {
      newestByArticle.set(key, record);
    }
  }
  return [...newestByArticle.values()].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}
