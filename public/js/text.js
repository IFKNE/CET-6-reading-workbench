export function splitParagraphs(article) {
  return article
    .split(/\r?\n\s*\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function tokenizeParagraph(paragraph) {
  return paragraph.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\s+|[^A-Za-z\s]/g) ?? [];
}

export function classifySelection(text) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return {
    text: normalized,
    scope: /[.!?。！？]$/.test(normalized) ? 'sentence' : 'phrase'
  };
}
