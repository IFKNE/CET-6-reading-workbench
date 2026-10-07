import { splitParagraphs, tokenizeParagraph, classifySelection } from './text.js';
import { addOrUpdateWord, createMarkdown, createWordSummary, filterWords } from './wordbook.js';
import { requestTranslation } from './api.js';
import { createArticleKey, createWarmupBatches, indexVocabulary, mergeVocabulary } from './article-cache.js';
import { createArticleRecord, countWordInArticle, dedupeArticles, restoreArticleState, updateArticleMetadata } from './article-model.js';
import { createFolder, deleteArticle, deleteFolder, getArticle, listArticles, listFolders, saveArticle } from './article-library.js';
import { nextTheme, readTheme } from './theme.js';
import { createRequestLock } from './request-lock.js';
import { PRESTUDY_TRANSLATION_VERSION, normalizePrestudyTranslation } from './prestudy.js';

const demoArticle = `The ability to read critically is increasingly important in a world overflowing with information. It helps us distinguish between evidence and opinion, recognize hidden assumptions, and make more thoughtful decisions.

Critical reading does not mean reading with suspicion alone. It means asking useful questions: What is the writer trying to prove? Which details support the claim? What alternative explanation might exist?`;

const frequencyOrder = { '最高频': 0, '常见': 1, '较少见': 2 };
const storageKeys = {
  article: 'cet6:article',
  wordbook: 'cet6:wordbook',
  highlights: 'cet6:highlights',
  prestudyCache: 'cet6:prestudy-cache'
};
const aiRequests = createRequestLock();

const elements = {
  pasteView: document.querySelector('#paste-view'),
  readerView: document.querySelector('#reader-view'),
  libraryView: document.querySelector('#library-view'),
  wordbookView: document.querySelector('#wordbook-view'),
  wordDetailView: document.querySelector('#word-detail-view'),
  wordDetailContent: document.querySelector('#word-detail-content'),
  libraryMount: document.querySelector('#library-mount'),
  articleInput: document.querySelector('#article-input'),
  articleCategory: document.querySelector('#article-category'),
  customCategory: document.querySelector('#custom-category'),
  articleFolder: document.querySelector('#article-folder'),
  articleLibraryList: document.querySelector('#article-library-list'),
  folderShelf: document.querySelector('#folder-shelf'),
  newFolderName: document.querySelector('#new-folder-name'),
  createFolder: document.querySelector('#create-folder'),
  pasteError: document.querySelector('#paste-error'),
  readerContent: document.querySelector('#reader-content'),
  readerStatus: document.querySelector('#reader-status'),
  themeToggle: document.querySelector('#theme-toggle'),
  readingCategory: document.querySelector('#reading-category'),
  readingProgress: document.querySelector('#reading-progress'),
  readingBookTitle: document.querySelector('#reading-book-title'),
  showArticleTranslation: document.querySelector('#show-article-translation'),
  saveArticle: document.querySelector('#save-article'),
  keyVocabulary: document.querySelector('#key-vocabulary'),
  annotationPanel: document.querySelector('#annotation-panel'),
  selectionActions: document.querySelector('#selection-actions'),
  selectionPreview: document.querySelector('#selection-preview'),
  wordbookDrawer: document.querySelector('#wordbook-drawer'),
  drawerBackdrop: document.querySelector('#drawer-backdrop'),
  wordbookList: document.querySelector('#wordbook-list'),
  wordSearch: document.querySelector('#word-search'),
  wordSourceFilter: document.querySelector('#word-source-filter'),
  wordQuickFilters: document.querySelector('#word-quick-filters'),
  wordbookCount: document.querySelector('#wordbook-count'),
  drawerCount: document.querySelector('#drawer-count'),
  contextMenu: document.querySelector('#word-context-menu'),
  contextMenuWord: document.querySelector('#context-menu-word'),
  questionModal: document.querySelector('#question-modal'),
  questionForm: document.querySelector('#article-question-form'),
  questionInput: document.querySelector('#article-question')
};

const state = {
  article: localStorage.getItem(storageKeys.article) ?? '',
  entries: readWordbook(),
  highlights: new Set(readHighlights()),
  selection: null,
  contextTarget: null,
  articleKey: '',
  prestudy: null,
  prestudyPending: false,
  articleId: null,
  warmupToken: 0,
  folderId: '',
  libraryFolderId: 'all',
  libraryRenderId: 0,
  detailWord: '',
  notes: {},
  expandedTranslations: new Set(),
  expandedNotes: new Set(),
  category: '短篇阅读',
  view: 'paste',
  wordFilters: { status: '', tag: '' }
};

function readWordbook() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKeys.wordbook) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function readHighlights() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKeys.highlights) ?? '[]');
    return Array.isArray(data) ? data.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readPrestudyCache() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKeys.prestudyCache) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function savePrestudyCache(cache) {
  const all = readPrestudyCache();
  all[cache.articleKey] = cache;
  const retained = Object.entries(all)
    .sort(([, left], [, right]) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 12);
  localStorage.setItem(storageKeys.prestudyCache, JSON.stringify(Object.fromEntries(retained)));
}

function normalizeWord(word) {
  return word.toLowerCase();
}

function setReaderStatus(message) {
  elements.readerStatus.textContent = message;
}

function applyTheme(theme) {
  const selected = readTheme(theme);
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('cet6:theme', selected);
  elements.themeToggle.setAttribute('aria-label', selected === 'dark' ? '切换为浅色模式' : '切换为暗色模式');
  elements.themeToggle.innerHTML = selected === 'dark' ? '☼ <span>日读</span>' : '◐ <span>夜读</span>';
}

function renderReadingMeta() {
  const paragraphs = splitParagraphs(state.article);
  elements.readingCategory.textContent = state.category || '短篇阅读';
  elements.readingProgress.textContent = `${paragraphs.length} 段精读`;
  elements.readingBookTitle.textContent = state.prestudy?.title || '未命名精读文章';
}

function switchToReader() {
  switchView('reader');
}

function switchToPaste() {
  switchView('paste');
  elements.articleInput.focus();
}

function switchView(view) {
  state.view = view;
  elements.pasteView.hidden = view !== 'paste';
  elements.readerView.hidden = view !== 'reader';
  elements.libraryView.hidden = view !== 'library';
  elements.wordbookView.hidden = view !== 'wordbook';
  elements.wordDetailView.hidden = view !== 'word-detail';
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view || (view === 'word-detail' && button.dataset.view === 'wordbook')));
  if (view === 'library') renderArticleLibrary();
  if (view === 'wordbook') renderWordbook();
  if (view === 'word-detail') renderWordDetail();
}

function resetAnnotation() {
  elements.annotationPanel.replaceChildren(createElement('div', 'annotation-empty', [
    createElement('span', 'annotation-mark', '✦'),
    createElement('p', '', '点击一个单词，或选中一段文字。'),
    createElement('small', '', '释义、翻译与学习笔记会显示在这里。')
  ]));
}

function createElement(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof content === 'string') node.textContent = content;
  if (Array.isArray(content)) node.append(...content);
  return node;
}

function selectedCategory() {
  return elements.articleCategory.value === 'custom'
    ? elements.customCategory.value.trim() || '自定义分类'
    : elements.articleCategory.value;
}

function renderKeyVocabulary() {
  elements.keyVocabulary.replaceChildren();
  const vocabulary = Object.values(state.prestudy?.vocabulary ?? {});
  if (!vocabulary.length) {
    elements.keyVocabulary.append(createElement('p', 'book-empty', state.prestudyPending ? '正在准备本篇重点词…' : '本篇尚无可展示的重点词。'));
    return;
  }
  vocabulary.slice(0, 24).forEach((item) => {
    const button = createElement('button', 'key-word-card', [
      createElement('strong', '', item.word),
      createElement('span', '', item.contextMeaning || item.senses?.[0]?.meaning || '查看释义')
    ]);
    button.type = 'button';
    button.addEventListener('click', () => renderWordAnnotation(item, item.word, state.article));
    elements.keyVocabulary.append(button);
  });
}

async function persistArticle(showStatus = true) {
  if (!state.article.trim()) return null;
  const existing = state.articleId
    ? await getArticle(state.articleId)
    : (await listArticles()).find((record) => createArticleKey(record.article) === state.articleKey);
  const base = createArticleRecord({
    id: existing?.id ?? state.articleId ?? undefined,
    article: state.article,
    category: state.category,
    folderId: state.folderId,
    prestudy: state.prestudy,
    highlights: [...state.highlights]
    , notes: state.notes
  });
  if (existing) {
    base.createdAt = existing?.createdAt ?? base.createdAt;
  }
  await saveArticle(base);
  state.articleId = base.id;
  if (showStatus) setReaderStatus(`《${base.title}》已保存到我的精读`);
  await renderArticleLibrary();
  return base;
}

function renderFolderOptions(folders, selectedId = state.folderId) {
  elements.articleFolder.replaceChildren(new Option('未归档', ''));
  folders.forEach((folder) => elements.articleFolder.add(new Option(folder.name, folder.id)));
  elements.articleFolder.value = folders.some((folder) => folder.id === selectedId) ? selectedId : '';
}

function renderFolderShelf(folders) {
  elements.folderShelf.replaceChildren();
  const choices = [{ id: 'all', name: '全部文章' }, { id: '', name: '未归档' }, ...folders];
  choices.forEach((folder) => {
    const chip = createElement('div', 'folder-chip');
    const open = createElement('button', state.libraryFolderId === folder.id ? 'is-active' : '', folder.name);
    open.type = 'button';
    open.addEventListener('click', () => { state.libraryFolderId = folder.id; renderArticleLibrary(); });
    chip.append(open);
    if (folder.id && folder.id !== 'all') {
      const remove = createElement('button', 'folder-delete', '×');
      remove.type = 'button'; remove.title = `删除文件夹 ${folder.name}`;
      remove.addEventListener('click', async () => {
        if (!window.confirm(`删除“${folder.name}”文件夹？其中的文章将保留为未归档。`)) return;
        const articles = await listArticles();
        await Promise.all(articles.filter((article) => article.folderId === folder.id).map((article) => saveArticle({ ...article, folderId: '', updatedAt: new Date().toISOString() })));
        await deleteFolder(folder.id);
        if (state.libraryFolderId === folder.id) state.libraryFolderId = 'all';
        if (state.folderId === folder.id) state.folderId = '';
        await renderArticleLibrary();
      });
      chip.append(remove);
    }
    elements.folderShelf.append(chip);
  });
}

async function renderArticleLibrary() {
  const renderId = ++state.libraryRenderId;
  elements.articleLibraryList.replaceChildren();
  try {
    const [storedArticles, folders] = await Promise.all([listArticles(), listFolders()]);
    if (renderId !== state.libraryRenderId) return;
    const articles = dedupeArticles(storedArticles);
    renderFolderOptions(folders);
    renderFolderShelf(folders);
    const visibleArticles = state.libraryFolderId === 'all' ? articles : articles.filter((article) => (article.folderId || '') === state.libraryFolderId);
    if (!visibleArticles.length) {
      elements.articleLibraryList.append(createElement('p', 'book-empty', articles.length ? '这个文件夹里还没有文章。' : '还没有保存的精读文章。'));
      return;
    }
    visibleArticles.forEach((record) => {
      const card = createElement('article', 'article-card');
      const folderName = folders.find((folder) => folder.id === record.folderId)?.name || '未归档';
      const open = createElement('button', 'article-card-open', [
        createElement('span', 'article-category-tag', `${record.category} · ${folderName}`),
        createElement('strong', '', record.title),
        createElement('small', '', `${new Date(record.updatedAt).toLocaleDateString('zh-CN')} · ${Object.keys(record.vocabulary ?? {}).length} 个重点词`)
      ]);
      open.type = 'button'; open.addEventListener('click', () => openSavedArticle(record.id));
      const edit = document.createElement('details'); edit.className = 'article-card-edit';
      edit.append(createElement('summary', '', '重命名 / 分类 / 文件夹'));
      const title = document.createElement('input'); title.value = record.title; title.setAttribute('aria-label', '文章标题');
      const category = document.createElement('input'); category.value = record.category; category.setAttribute('aria-label', '文章分类');
      const folder = document.createElement('select'); folder.setAttribute('aria-label', '所属文件夹'); folder.append(new Option('未归档', ''));
      folders.forEach((item) => folder.add(new Option(item.name, item.id))); folder.value = record.folderId || '';
      const save = createElement('button', 'quiet-button', '保存修改'); save.type = 'button';
      save.addEventListener('click', async () => { await saveArticle(updateArticleMetadata(record, { title: title.value, category: category.value, folderId: folder.value })); renderArticleLibrary(); });
      const remove = createElement('button', 'article-delete', '删除本篇'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`删除《${record.title}》？此操作无法恢复。`)) return;
        const articleKey = createArticleKey(record.article);
        await Promise.all(storedArticles.filter((item) => createArticleKey(item.article) === articleKey).map((item) => deleteArticle(item.id)));
        renderArticleLibrary();
      });
      edit.append(title, category, folder, save, remove);
      card.append(open, edit); elements.articleLibraryList.append(card);
    });
  } catch (error) {
    elements.articleLibraryList.append(createElement('p', 'book-empty', error.message));
  }
}

async function openSavedArticle(id) {
  const record = await getArticle(id);
  if (!record) return;
  const restored = restoreArticleState(record);
  state.articleId = restored.articleId;
  state.article = restored.article;
  state.category = restored.category;
  state.folderId = restored.folderId;
  state.highlights = new Set(restored.highlights);
  state.notes = restored.notes;
  state.expandedTranslations.clear(); state.expandedNotes.clear();
  const restoredTranslation = normalizePrestudyTranslation(restored.prestudy, splitParagraphs(state.article));
  const hadStoredTranslation = Array.isArray(restored.prestudy.translation) && restored.prestudy.translation.some(Boolean);
  state.prestudy = {
    ...restored.prestudy,
    translation: restoredTranslation,
    translationVersion: restoredTranslation.some(Boolean) ? PRESTUDY_TRANSLATION_VERSION : restored.prestudy.translationVersion
  };
  state.articleKey = createArticleKey(state.article);
  state.prestudy.articleKey = state.articleKey;
  elements.articleInput.value = state.article;
  elements.articleCategory.value = ['短篇阅读', '长篇阅读', '听力原文'].includes(state.category) ? state.category : 'custom';
  elements.customCategory.hidden = elements.articleCategory.value !== 'custom';
  elements.customCategory.value = elements.articleCategory.value === 'custom' ? state.category : '';
  const folders = await listFolders();
  renderFolderOptions(folders, state.folderId);
  elements.showArticleTranslation.disabled = !state.prestudy.translation.some(Boolean);
  renderArticle();
  renderKeyVocabulary();
  resetAnnotation();
  switchToReader();
  if (hadStoredTranslation && !restoredTranslation.some(Boolean)) {
    setReaderStatus('旧版段落译文已失效，正在重新生成…');
    prepareArticleStudy();
  } else {
    setReaderStatus(`已打开《${record.title}》· 本地缓存已恢复`);
  }
}

function showLoading(source) {
  elements.annotationPanel.replaceChildren(
    createElement('p', 'annotation-label', '正在查询'),
    createElement('p', 'annotation-source', source),
    createElement('p', 'annotation-translation', 'DeepSeek 正在整理适合六级精读的解释…')
  );
}

function showError(source, error) {
  elements.annotationPanel.replaceChildren(
    createElement('p', 'annotation-label', '暂时无法翻译'),
    createElement('p', 'annotation-source', source),
    createElement('p', 'annotation-translation', error.message)
  );
}

function renderArticle() {
  elements.readerContent.replaceChildren();
  const paragraphs = splitParagraphs(state.article);
  paragraphs.forEach((paragraph, index) => {
    const wrapper = createElement('section', 'article-paragraph');
    const heading = createElement('div', 'paragraph-heading');
    heading.append(
      createElement('span', 'paragraph-number', `¶ ${String(index + 1).padStart(2, '0')}`),
      createElement('div', 'paragraph-actions', [createParagraphButton(paragraph, index), createParagraphNoteButton(index)])
    );
    wrapper.append(heading);

    for (const token of tokenizeParagraph(paragraph)) {
      if (/^[A-Za-z]/.test(token)) {
        const word = createElement('button', 'word-token', token);
        word.type = 'button';
        word.dataset.word = token;
        word.dataset.context = paragraph;
        if (state.highlights.has(normalizeWord(token))) word.classList.add('is-highlighted');
        wrapper.append(word);
      } else {
        wrapper.append(document.createTextNode(token));
      }
    }
    if (state.expandedTranslations.has(index) && state.prestudy?.translation?.[index]) {
      wrapper.append(createElement('div', 'inline-translation', [createElement('span', 'inline-label', '译文'), createElement('p', '', state.prestudy.translation[index])]));
    }
    if (state.expandedNotes.has(index)) {
      const note = document.createElement('textarea');
      note.className = 'paragraph-note-input'; note.placeholder = '写下这一段的逻辑、陌生表达或自己的理解…'; note.value = state.notes[index] || '';
      note.addEventListener('change', () => { state.notes[index] = note.value.trim(); persistArticle(false).catch(() => {}); });
      wrapper.append(createElement('div', 'paragraph-note', [createElement('span', 'inline-label', '小记'), note]));
    }
    elements.readerContent.append(wrapper);
  });
  renderReadingMeta();
  setReaderStatus(`本文共 ${paragraphs.length} 段 · 点击单词开始批注`);
}

function createParagraphButton(paragraph, index) {
  const hasTranslation = Boolean(state.prestudy?.translation?.[index]);
  const requestKey = `paragraph:${state.articleKey}:${index}`;
  const isPending = aiRequests.isPending(requestKey);
  const button = createElement('button', 'paragraph-translate', isPending ? '翻译中…' : state.expandedTranslations.has(index) ? '隐藏译文' : hasTranslation ? '显示译文' : '翻译本段');
  button.type = 'button';
  button.disabled = isPending;
  if (isPending) button.setAttribute('aria-busy', 'true');
  button.addEventListener('click', async () => {
    if (!hasTranslation) {
      const request = aiRequests.run(requestKey, () => requestTranslation({ scope: 'paragraph', text: paragraph }));
      if (!request) return;
      renderArticle();
      setReaderStatus(`第 ${index + 1} 段正在翻译…`);
      try {
        const result = await request;
        state.prestudy ??= { articleKey: state.articleKey, title: '未命名精读文章', translation: [], translationVersion: PRESTUDY_TRANSLATION_VERSION, vocabulary: {}, createdAt: new Date().toISOString() };
        state.prestudy.translation[index] = result.translation;
        savePrestudyCache(state.prestudy);
      } catch (error) {
        renderArticle();
        setReaderStatus(error.message);
        return;
      }
    }
    state.expandedTranslations.has(index) ? state.expandedTranslations.delete(index) : state.expandedTranslations.add(index);
    renderArticle();
  });
  return button;
}

function createParagraphNoteButton(index) {
  const button = createElement('button', 'paragraph-note-toggle', state.expandedNotes.has(index) ? '收起小记' : '小记');
  button.type = 'button'; button.addEventListener('click', () => { state.expandedNotes.has(index) ? state.expandedNotes.delete(index) : state.expandedNotes.add(index); renderArticle(); });
  return button;
}

function saveLookupToPrestudy(data) {
  if (!state.prestudy) return;
  state.prestudy = mergeVocabulary(state.prestudy, data);
  state.prestudy.createdAt = new Date().toISOString();
  savePrestudyCache(state.prestudy);
}

function startWordWarmup() {
  if (!state.article || !state.prestudy) return;
  const token = ++state.warmupToken;
  const articleKey = state.articleKey;
  const batches = createWarmupBatches(state.article, state.prestudy.vocabulary);
  if (!batches.length) return;
  (async () => {
    for (const batch of batches) {
      if (token !== state.warmupToken || articleKey !== state.articleKey) return;
      try {
        const batchText = batch.join('\n');
        const result = await aiRequests.share(
          `warmup:${articleKey}:${batchText}`,
          () => requestTranslation({ scope: 'word-batch', text: batchText, context: state.article })
        );
        if (token !== state.warmupToken || articleKey !== state.articleKey) return;
        const entries = Array.isArray(result.data?.vocabulary) ? result.data.vocabulary : [];
        entries.forEach((entry) => { if (entry?.word) saveLookupToPrestudy(entry); });
      } catch {
        return;
      }
    }
  })();
}

function saveWordFromLookup(data, fallbackWord, context) {
  const senses = Array.isArray(data.senses) ? data.senses : [];
  saveWord({
    word: data.word || fallbackWord,
    meaning: data.contextMeaning || senses[0]?.meaning || '待补充',
    partOfSpeech: senses[0]?.partOfSpeech || '词义',
    context,
    phrases: Array.isArray(data.phrases) ? data.phrases : [],
    senses: Array.isArray(data.senses) ? data.senses : [],
    example: data.example ?? null,
    importanceTags: Array.isArray(data.importanceTags) ? data.importanceTags : [],
    wordFormation: data.wordFormation ?? null,
    synonyms: Array.isArray(data.synonyms) ? data.synonyms : [],
    antonyms: Array.isArray(data.antonyms) ? data.antonyms : [],
    confusables: Array.isArray(data.confusables) ? data.confusables : [],
    extraExamples: Array.isArray(data.extraExamples) ? data.extraExamples : []
  });
}

async function prepareArticleStudy() {
  state.articleKey = createArticleKey(state.article);
  const requestKey = state.articleKey;
  const paragraphs = splitParagraphs(state.article);
  const cached = readPrestudyCache()[state.articleKey];
  const cachedTranslation = normalizePrestudyTranslation(cached, paragraphs);
  if (cachedTranslation.some(Boolean)) {
    state.prestudy = { ...cached, translation: cachedTranslation, translationVersion: PRESTUDY_TRANSLATION_VERSION };
    elements.showArticleTranslation.disabled = !cachedTranslation.some(Boolean);
    renderKeyVocabulary();
    renderReadingMeta();
    setReaderStatus(`预研读缓存已就绪 · ${Object.keys(cached.vocabulary).length} 个重点词可即点即看`);
    startWordWarmup();
    return;
  }

  state.prestudy = {
    articleKey: state.articleKey,
    title: cached?.title || '',
    translation: [],
    translationVersion: PRESTUDY_TRANSLATION_VERSION,
    vocabulary: cached?.vocabulary ?? {},
    createdAt: new Date().toISOString()
  };
  state.prestudyPending = true;
  elements.showArticleTranslation.disabled = true;
  setReaderStatus('正在后台预研读：准备全文译文与六级重点词…');
  try {
    const result = await aiRequests.share(
      `prestudy:${requestKey}`,
      () => requestTranslation({ scope: 'prestudy', text: state.article })
    );
    if (state.articleKey !== requestKey) return;
    const data = result.data ?? {};
    const translation = normalizePrestudyTranslation(data, paragraphs);
    state.prestudy = {
      articleKey: state.articleKey,
      title: data.title || '未命名精读文章',
      translation,
      translationVersion: PRESTUDY_TRANSLATION_VERSION,
      vocabulary: {
        ...indexVocabulary(Array.isArray(data.vocabulary) ? data.vocabulary : []),
        ...state.prestudy.vocabulary
      },
      createdAt: new Date().toISOString()
    };
    savePrestudyCache(state.prestudy);
    elements.showArticleTranslation.disabled = !state.prestudy.translation.some(Boolean);
    renderKeyVocabulary();
    renderReadingMeta();
    setReaderStatus(`预研读完成 · 已缓存全文译文与 ${Object.keys(state.prestudy.vocabulary).length} 个重点词`);
    startWordWarmup();
  } catch {
    if (state.articleKey === requestKey) {
      setReaderStatus('后台预研读暂不可用；仍可逐词查询，查询结果会自动缓存');
    }
  } finally {
    if (state.articleKey === requestKey) state.prestudyPending = false;
  }
}

async function lookupWord(word, context, saveAfterLookup = false) {
  const cached = state.prestudy?.vocabulary?.[normalizeWord(word)];
  if (cached) {
    renderWordAnnotation(cached, word, context);
    if (saveAfterLookup) saveWordFromLookup(cached, word, context);
    setReaderStatus(`已从预研读缓存显示 “${word}”`);
    return;
  }
  const requestKey = `lookup:${normalizeWord(word)}:${context}`;
  const wasPending = aiRequests.isPending(requestKey);
  const request = aiRequests.share(requestKey, () => requestTranslation({ scope: 'word-batch', text: word, context }));
  if (!wasPending) {
    showLoading(word);
    setReaderStatus(`正在查询 “${word}” 的词义…`);
  }
  try {
    const result = await request;
    const data = result.data?.vocabulary?.find((entry) => normalizeWord(entry.word || '') === normalizeWord(word)) ?? result.data?.vocabulary?.[0];
    if (!data) throw new Error('暂未获得该单词的释义，请重试。');
    renderWordAnnotation(data, word, context);
    saveLookupToPrestudy(data);
    if (saveAfterLookup) saveWordFromLookup(data, word, context);
    setReaderStatus(`已显示 “${word}” 的全部常见词义`);
  } catch (error) {
    showError(word, error);
    setReaderStatus('查询失败，可检查 DeepSeek Key 或网络后重试');
  }
}

function renderWordAnnotation(data, queriedWord, context) {
  const word = data.word || queriedWord;
  const senses = Array.isArray(data.senses) ? data.senses : [];
  const groups = new Map();
  for (const sense of senses) {
    const part = sense.partOfSpeech || '其他';
    groups.set(part, [...(groups.get(part) ?? []), sense]);
  }

  const content = [
    createElement('p', 'annotation-label', 'WORD NOTE · AI 常见度判断'),
    createElement('h2', 'word-title', word),
    createElement('p', 'phonetic', data.pronunciation || '音标暂未提供'),
    createElement('p', 'context-meaning', `当前语境：${data.contextMeaning || senses[0]?.meaning || '请结合原句判断'}`)
  ];

  for (const [part, values] of groups) {
    const list = createElement('ul', 'sense-list');
    values
      .slice()
      .sort((left, right) => (frequencyOrder[left.frequency] ?? 9) - (frequencyOrder[right.frequency] ?? 9))
      .forEach((sense) => {
        list.append(createElement('li', '', [
          createElement('span', 'frequency', sense.frequency || '常见'),
          createElement('span', '', sense.meaning || '释义暂未提供')
        ]));
      });
    content.push(createElement('section', 'sense-group', [createElement('h3', '', part), list]));
  }

  if (groups.size === 0) content.push(createElement('p', 'annotation-translation', '未获得可展示的义项，请重新查询。'));

  const phrases = Array.isArray(data.phrases) ? data.phrases.filter((item) => item?.phrase) : [];
  if (phrases.length) {
    const list = createElement('ul', 'phrase-list');
    phrases.slice(0, 3).forEach((item) => {
      list.append(createElement('li', '', [
        createElement('strong', '', item.phrase),
        createElement('span', '', item.meaning || '释义暂未提供')
      ]));
    });
    content.push(createElement('section', 'sense-group', [createElement('h3', '', '常用短语'), list]));
  }

  if (data.example?.english) {
    content.push(createElement('section', 'example-card', [
      createElement('h3', '', '例句'),
      createElement('p', 'example-english', data.example.english),
      createElement('p', 'example-chinese', data.example.chinese || '例句译文暂未提供')
    ]));
  }

  const saveButton = createElement('button', 'primary-button save-word', '加入单词本  +');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => saveWordFromLookup(data, word, context));
  content.push(saveButton);
  elements.annotationPanel.replaceChildren(...content);
}

function renderArticleTranslation() {
  const translation = state.prestudy?.translation;
  if (!Array.isArray(translation) || !translation.some(Boolean)) {
    showError('全文译文', new Error('全文译文仍在后台准备，请稍后再试。'));
    return;
  }
  const content = [
    createElement('p', 'annotation-label', 'ARTICLE TRANSLATION · 预研读缓存'),
    createElement('h2', 'word-title', '全文译文')
  ];
  splitParagraphs(state.article).forEach((sourceParagraph, index) => {
    content.push(createElement('section', 'article-translation', [
      createElement('span', 'paragraph-number', `¶ ${String(index + 1).padStart(2, '0')}`),
      createElement('p', '', translation[index] || '该段译文暂未生成，请点击原文下方“翻译本段”。')
    ]));
  });
  elements.annotationPanel.replaceChildren(...content);
  setReaderStatus('已显示缓存的全文译文');
}

async function translateText(scope, text) {
  const request = aiRequests.run(`translate:${scope}:${text}`, () => requestTranslation({ scope, text }));
  if (!request) return;
  showLoading(text);
  setReaderStatus('正在翻译选中的内容…');
  try {
    const result = await request;
    elements.annotationPanel.replaceChildren(
      createElement('p', 'annotation-label', `${scope === 'paragraph' ? '段落' : scope === 'sentence' ? '句子' : '短语'}翻译`),
      createElement('p', 'annotation-source', text),
      createElement('p', 'annotation-translation', result.translation)
    );
    setReaderStatus('翻译完成');
  } catch (error) {
    showError(text, error);
    setReaderStatus('翻译失败，可检查 DeepSeek Key 或网络后重试');
  }
}

async function saveWord(entry) {
  const savedAt = new Date().toISOString().slice(0, 10);
  if (!state.articleId && state.article.trim()) await persistArticle(false);
  const source = state.articleId ? {
    articleId: state.articleId,
    title: state.prestudy?.title || '未命名精读文章',
    count: countWordInArticle(state.article, entry.word)
  } : undefined;
  state.entries = addOrUpdateWord(state.entries, { ...entry, savedAt, source });
  localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
  renderWordbook();
  setReaderStatus(`“${entry.word}” 已加入单词本`);
}

function updateWordEntry(word, changes) {
  state.entries = state.entries.map((entry) => entry.word === word ? { ...entry, ...changes } : entry);
  localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
  if (state.view === 'word-detail') renderWordDetail();
  else renderWordbook();
}

async function enrichWordEntry(entry) {
  const requestKey = `archive:${normalizeWord(entry.word)}`;
  const request = aiRequests.run(requestKey, () => requestTranslation({ scope: 'word', text: entry.word, context: entry.context || '' }));
  if (!request) return;
  if (state.view === 'word-detail' && state.detailWord === entry.word) renderWordDetail();
  try {
    const result = await request;
    updateWordEntry(entry.word, { ...result.data, learningStatus: entry.learningStatus ?? 'unknown', sources: entry.sources ?? {} });
    setReaderStatus(`“${entry.word}” 的详细档案已生成`);
  } catch (error) {
    setReaderStatus(error.message);
  } finally {
    if (state.view === 'word-detail' && state.detailWord === entry.word) renderWordDetail();
  }
}

function renderArchiveBlock(entry) {
  const block = createElement('div', 'word-archive');
  const formation = entry.wordFormation;
  const hasDetailedArchive = Boolean(
    formation?.root || formation?.derivatives?.length || entry.synonyms?.length || entry.antonyms?.length || entry.confusables?.length || entry.extraExamples?.length
  );
  const section = (title, content) => createElement('section', 'archive-section', [createElement('h4', '', title), content]);
  const textList = (items) => createElement('ul', 'archive-list', items.map((item) => createElement('li', '', item)));
  if (hasDetailedArchive && entry.senses?.length) {
    block.append(section('全部常用义项', textList(entry.senses.map((sense) => `${sense.partOfSpeech || '词性'} · ${sense.meaning || '释义待补全'}${sense.frequency ? `（${sense.frequency}）` : ''}`))));
  }
  if (formation?.root || formation?.derivatives?.length) {
    const parts = [formation.root ? `词根 / 构词提示：${formation.root}` : '词根 / 构词提示：—', ...(formation.derivatives ?? [])];
    block.append(section('构词提示', textList(parts)));
  }
  if (entry.synonyms?.length) block.append(section('常用近义词与区别', textList(entry.synonyms)));
  if (entry.antonyms?.length) block.append(section('反义词', textList(entry.antonyms)));
  if (entry.confusables?.length) block.append(section('易混词辨析', textList(entry.confusables.map((item) => `${item.word}：${item.difference}`))));
  if (entry.extraExamples?.length) {
    const examples = createElement('div', 'archive-examples');
    entry.extraExamples.forEach((item) => examples.append(createElement('div', 'archive-example', [createElement('strong', '', item.english), createElement('span', '', item.chinese)])));
    block.append(section('补充例句', examples));
  }
  if (!hasDetailedArchive) {
    block.replaceChildren();
    const requestKey = `archive:${normalizeWord(entry.word)}`;
    const isPending = aiRequests.isPending(requestKey);
    const content = isPending
      ? [createElement('span', 'archive-spinner'), createElement('span', '', '正在生成详细档案…')]
      : '生成详细档案 →';
    const enrich = createElement('button', `archive-generate${isPending ? ' is-loading' : ''}`, content);
    enrich.type = 'button'; enrich.addEventListener('click', () => enrichWordEntry(entry)); block.append(enrich);
    enrich.disabled = isPending;
    if (isPending) {
      enrich.setAttribute('aria-busy', 'true');
      enrich.querySelector('.archive-spinner').setAttribute('aria-hidden', 'true');
    }
  }
  return block;
}

function renderWordbook() {
  const count = String(state.entries.length);
  elements.wordbookCount.textContent = count;
  elements.drawerCount.textContent = count;
  const selectedSource = elements.wordSourceFilter.value;
  const sources = new Map();
  state.entries.forEach((entry) => Object.entries(entry.sources ?? {}).forEach(([id, source]) => sources.set(id, source.title)));
  elements.wordSourceFilter.replaceChildren(new Option('全部来源文章', ''));
  sources.forEach((title, id) => elements.wordSourceFilter.add(new Option(title, id)));
  elements.wordSourceFilter.value = sources.has(selectedSource) ? selectedSource : '';
  elements.wordbookList.replaceChildren();
  const visibleEntries = filterWords(state.entries, { query: elements.wordSearch.value, sourceId: elements.wordSourceFilter.value, ...state.wordFilters });
  if (visibleEntries.length === 0) {
    elements.wordbookList.append(createElement('p', 'book-empty', '这里还没有单词。阅读时点击任意单词，再选择“加入单词本”。'));
    return;
  }
  for (const entry of visibleEntries) {
    const summary = createWordSummary(entry);
    if (entry.entryType === 'phrase') {
      const remove = createElement('button', 'remove-word', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `移除短语 ${entry.word}`);
      remove.addEventListener('click', () => { state.entries = state.entries.filter((item) => item.word !== entry.word); localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries)); renderWordbook(); });
      elements.wordbookList.append(createElement('article', 'wordbook-row phrase-book-row', [
        createElement('strong', '', entry.word),
        createElement('span', 'word-row-meaning', entry.meaning),
        createElement('span', 'word-row-meta', '短语 · 已收录'), remove
      ]));
      continue;
    }
    const row = createElement('button', 'wordbook-row', [
      createElement('strong', '', entry.word),
      createElement('span', 'word-row-meaning', summary.meaning),
      createElement('span', 'word-row-phrase', summary.phrase),
      createElement('span', 'word-row-meta', `${Object.keys(entry.sources ?? {}).length} 篇来源 · ${entry.learningStatus === 'known' ? '认识' : entry.learningStatus === 'fuzzy' ? '模糊' : '不会'}`),
      createElement('span', 'word-row-arrow', '查看 →')
    ]);
    row.type = 'button';
    row.addEventListener('click', () => { state.detailWord = entry.word; switchView('word-detail'); });
    elements.wordbookList.append(row);
  }
}

function renderWordDetail() {
  const entry = state.entries.find((item) => item.word === state.detailWord);
  elements.wordDetailContent.replaceChildren();
  if (!entry) {
    elements.wordDetailContent.append(createElement('p', 'book-empty', '没有找到这个单词，可能已被移除。'));
    return;
  }
  const summary = createWordSummary(entry);
  const back = createElement('button', 'text-button back-button', '← 返回单词本');
  back.type = 'button'; back.addEventListener('click', () => switchView('wordbook'));
  const remove = createElement('button', 'article-delete', '从单词本移除');
  remove.type = 'button'; remove.addEventListener('click', () => {
    state.entries = state.entries.filter((item) => item.word !== entry.word);
    localStorage.setItem(storageKeys.wordbook, JSON.stringify(state.entries));
    state.detailWord = ''; switchView('wordbook');
  });
  const statuses = [['unknown', '不会'], ['fuzzy', '模糊'], ['known', '认识']];
  const statusControls = createElement('div', 'word-status-controls');
  statuses.forEach(([value, label]) => {
    const button = createElement('button', entry.learningStatus === value ? 'is-selected' : '', label);
    button.type = 'button'; button.addEventListener('click', () => updateWordEntry(entry.word, { learningStatus: value })); statusControls.append(button);
  });
  const tags = (entry.importanceTags ?? []).map((tag) => createElement('span', 'importance-tag', tag));
  const sources = Object.values(entry.sources ?? {}).map((source) => `${source.title}（${source.count} 次）`).join('；') || '尚未关联精读文章';
  elements.wordDetailContent.append(createElement('article', 'word-detail-sheet', [
    back,
    createElement('p', 'eyebrow', 'CET–6 VOCABULARY NOTE'),
    createElement('div', 'word-detail-title', [createElement('h1', '', entry.word), createElement('span', 'phonetic', entry.pronunciation || '')]),
    createElement('div', 'importance-tags', tags),
    createElement('p', 'word-main-meaning', summary.meaning),
    createElement('section', 'detail-summary-section', [createElement('h2', '', '常用短语'), createElement('p', '', summary.phrase)]),
    createElement('section', 'detail-summary-section', [createElement('h2', '', '原文例句'), createElement('p', 'word-example', `${summary.example}${entry.example?.chinese ? ` · ${entry.example.chinese}` : ''}`)]),
    createElement('section', 'detail-summary-section', [createElement('h2', '', '来源与掌握度'), createElement('p', 'word-sources', sources), statusControls]),
    createElement('section', 'detail-archive-section', [createElement('h2', '', '详细六级档案'), renderArchiveBlock(entry)]),
    remove
  ]));
}

function exportWordbook() {
  if (state.entries.length === 0) return;
  const markdown = createMarkdown(state.entries, new Date().toISOString().slice(0, 10));
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cet6-wordbook.md';
  link.click();
  URL.revokeObjectURL(url);
}

async function exportWordbookDocx() {
  if (state.entries.length === 0) return;
  try {
    const response = await fetch('/api/wordbook.docx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: state.entries })
    });
    if (!response.ok) throw new Error('Word 文档生成失败。');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = 'cet6-wordbook.docx'; link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setReaderStatus(error.message);
  }
}

function toggleHighlight(word) {
  const key = normalizeWord(word);
  if (state.highlights.has(key)) {
    state.highlights.delete(key);
  } else {
    state.highlights.add(key);
  }
  localStorage.setItem(storageKeys.highlights, JSON.stringify([...state.highlights]));
  renderArticle();
  if (state.articleId) persistArticle(false).catch(() => {});
  setReaderStatus(`“${word}” ${state.highlights.has(key) ? '已高亮' : '已取消高亮'}`);
}

function openContextMenu(event, target) {
  state.contextTarget = { word: target.dataset.word, context: target.dataset.context };
  elements.contextMenuWord.textContent = target.dataset.word;
  elements.contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  elements.contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 220)}px`;
  elements.contextMenu.hidden = false;
}

function closeContextMenu() {
  elements.contextMenu.hidden = true;
  state.contextTarget = null;
}

function openQuestionModal() {
  closeContextMenu();
  elements.questionModal.hidden = false;
  elements.questionInput.value = '';
  elements.questionInput.focus();
}

function closeQuestionModal() {
  elements.questionModal.hidden = true;
}

async function askArticle(question) {
  const request = aiRequests.run(`question:${state.articleKey}:${question}`, () => requestTranslation({ scope: 'question', text: question, context: state.article }));
  if (!request) return;
  showLoading(question);
  setReaderStatus('AI 正在结合全文组织回答…');
  try {
    const result = await request;
    elements.annotationPanel.replaceChildren(
      createElement('p', 'annotation-label', '全文问答'),
      createElement('p', 'annotation-source', question),
      createElement('p', 'annotation-translation', result.answer)
    );
    setReaderStatus('全文问答完成');
  } catch (error) {
    showError(question, error);
    setReaderStatus('提问失败，可检查网络后重试');
  }
}

function openDrawer() {
  switchView('wordbook');
}

function closeDrawer() {
  switchView(state.article ? 'reader' : 'paste');
}

function updateSelectionActions() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!elements.readerContent.contains(range.commonAncestorContainer)) return;
  const classified = classifySelection(selection.toString());
  if (!classified.text) return;
  state.selection = classified;
  elements.selectionPreview.textContent = `“${classified.text}”`;
  elements.selectionActions.hidden = false;
}

document.querySelector('#open-reader').addEventListener('click', () => {
  const article = elements.articleInput.value.trim();
  if (!article) {
    elements.pasteError.textContent = '请先粘贴一篇英文文章。';
    elements.articleInput.focus();
    return;
  }
  elements.pasteError.textContent = '';
  state.article = article;
  state.articleId = null;
  state.category = selectedCategory();
  state.folderId = elements.articleFolder.value;
  state.highlights = new Set();
  state.notes = {}; state.expandedTranslations.clear(); state.expandedNotes.clear();
  state.prestudy = null;
  state.notes = {};
  localStorage.setItem(storageKeys.article, article);
  renderArticle();
  resetAnnotation();
  switchToReader();
  prepareArticleStudy();
});

document.querySelector('#demo-article').addEventListener('click', () => {
  elements.articleInput.value = demoArticle;
  elements.articleInput.focus();
});

elements.articleCategory.addEventListener('change', () => {
  elements.customCategory.hidden = elements.articleCategory.value !== 'custom';
  if (!elements.customCategory.hidden) elements.customCategory.focus();
});

document.querySelector('#back-to-paste').addEventListener('click', switchToPaste);
document.querySelectorAll('a[href="#paste-view"]').forEach((link) => {
  link.addEventListener('click', () => window.setTimeout(switchToPaste, 0));
});
document.querySelector('#open-library').addEventListener('click', () => switchView('library'));
elements.createFolder.addEventListener('click', async () => {
  const name = elements.newFolderName.value.trim();
  if (!name) { elements.newFolderName.focus(); return; }
  const folders = await listFolders();
  if (folders.some((folder) => folder.name === name)) { elements.newFolderName.select(); return; }
  const folder = await createFolder(name);
  elements.newFolderName.value = '';
  state.folderId = folder.id;
  state.libraryFolderId = folder.id;
  await renderArticleLibrary();
});
elements.articleFolder.addEventListener('change', () => { state.folderId = elements.articleFolder.value; });
elements.themeToggle.addEventListener('click', () => applyTheme(nextTheme(document.documentElement.dataset.theme)));
elements.saveArticle.addEventListener('click', () => {
  persistArticle().catch((error) => setReaderStatus(error.message));
});
elements.showArticleTranslation.addEventListener('click', renderArticleTranslation);
document.querySelector('#clear-article').addEventListener('click', () => {
  localStorage.removeItem(storageKeys.article);
  localStorage.removeItem(storageKeys.highlights);
  state.article = '';
  state.articleId = null;
  state.folderId = '';
  state.articleKey = '';
  state.prestudy = null;
  state.prestudyPending = false;
  state.highlights.clear();
  elements.articleInput.value = '';
  elements.readerContent.replaceChildren();
  elements.showArticleTranslation.disabled = true;
  resetAnnotation();
  switchToPaste();
});

elements.readerContent.addEventListener('click', (event) => {
  const word = event.target.closest('.word-token');
  if (word) lookupWord(word.dataset.word, word.dataset.context);
});

elements.readerContent.addEventListener('contextmenu', (event) => {
  const word = event.target.closest('.word-token');
  if (!word) return;
  event.preventDefault();
  openContextMenu(event, word);
});

elements.contextMenu.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  if (!action || !state.contextTarget) return;
  const { word, context } = state.contextTarget;
  if (action === 'highlight') toggleHighlight(word);
  if (action === 'translate') lookupWord(word, context);
  if (action === 'save') lookupWord(word, context, true);
  if (action === 'question') openQuestionModal();
  if (action !== 'question') closeContextMenu();
});

document.addEventListener('click', (event) => {
  if (!elements.contextMenu.hidden && !elements.contextMenu.contains(event.target)) closeContextMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeContextMenu();
    closeQuestionModal();
  }
});

document.querySelector('#close-question').addEventListener('click', closeQuestionModal);
elements.questionModal.addEventListener('click', (event) => {
  if (event.target === elements.questionModal) closeQuestionModal();
});
elements.questionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = elements.questionInput.value.trim();
  if (!question || !state.article) return;
  closeQuestionModal();
  askArticle(question);
});

document.addEventListener('mouseup', () => window.setTimeout(updateSelectionActions, 0));
document.addEventListener('keyup', (event) => {
  if (event.key.startsWith('Arrow') || event.key === 'Shift') window.setTimeout(updateSelectionActions, 0);
});
document.querySelector('#translate-selection').addEventListener('click', () => {
  if (state.selection) translateText(state.selection.scope, state.selection.text);
  elements.selectionActions.hidden = true;
  window.getSelection()?.removeAllRanges();
});
document.querySelector('#save-selection-phrase').addEventListener('click', async (event) => {
  if (!state.selection?.text) return;
  const phrase = state.selection.text;
  const request = aiRequests.run(`save-phrase:${state.selection.scope}:${phrase}`, () => requestTranslation({ scope: state.selection.scope, text: phrase }));
  if (!request) return;
  const button = event.currentTarget;
  const idleLabel = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '正在收录…';
  try {
    const result = await request;
    await saveWord({ word: phrase, meaning: result.translation, partOfSpeech: '短语', context: phrase, entryType: 'phrase' });
    elements.selectionActions.hidden = true; window.getSelection()?.removeAllRanges();
  } catch (error) {
    setReaderStatus(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = idleLabel;
  }
});

document.querySelector('#open-wordbook').addEventListener('click', openDrawer);
document.querySelector('#close-wordbook').addEventListener('click', closeDrawer);
document.querySelector('#export-wordbook').addEventListener('click', exportWordbook);
document.querySelector('#export-wordbook-docx').addEventListener('click', exportWordbookDocx);
elements.wordSearch.addEventListener('input', renderWordbook);
elements.wordSourceFilter.addEventListener('change', renderWordbook);
elements.wordQuickFilters.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  state.wordFilters = { status: button.dataset.status ?? '', tag: button.dataset.tag ?? '' };
  elements.wordQuickFilters.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
  renderWordbook();
});
document.querySelectorAll('.nav-button[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));

elements.articleInput.value = state.article;
applyTheme(localStorage.getItem('cet6:theme'));
elements.libraryMount.append(document.querySelector('#article-library'));
elements.wordbookView.append(elements.wordbookDrawer);
elements.wordbookDrawer.hidden = false;
elements.drawerBackdrop.remove();
switchView('paste');
renderWordbook();
renderArticleLibrary();
