// 视图之间的返回关系：详情页与单词本都要回到“来时的那个视图”。
const backTargets = {
  'word-detail': {
    reader: { view: 'reader', label: '← 返回原文' },
    wordbook: { view: 'wordbook', label: '← 返回单词本' }
  },
  wordbook: {
    reader: { view: 'reader', label: '← 返回原文' },
    paste: { view: 'paste', label: '← 返回文章输入' },
    library: { view: 'library', label: '← 返回我的精读' },
    'word-detail': { view: 'word-detail', label: '← 返回单词详情' }
  }
};

export function resolveViewBack({ view, origin = '', hasArticle = false } = {}) {
  const fallback = hasArticle
    ? { view: 'reader', label: '← 返回原文' }
    : { view: 'paste', label: '← 返回文章输入' };
  const target = backTargets[view]?.[origin];
  // 返回副本：调用方改动返回值时不会污染模块级的 backTargets 表。
  return target ? { ...target } : fallback;
}
