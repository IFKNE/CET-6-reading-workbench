export const PRESTUDY_TRANSLATION_VERSION = 2;

export function normalizePrestudyTranslation(data, paragraphs) {
  if (data?.translationVersion !== PRESTUDY_TRANSLATION_VERSION || !Array.isArray(data.translation)) return [];
  const count = Array.isArray(paragraphs) ? paragraphs.length : 0;
  if (count === 0) return [];

  if (data.translation.every((item) => typeof item === 'string')) {
    return data.translation.length === count
      ? data.translation.map((item) => item.trim())
      : [];
  }

  const translations = Array(count).fill('');
  data.translation.forEach((item) => {
    const index = Number(item?.paragraphIndex ?? item?.index);
    const text = typeof item?.text === 'string' ? item.text : typeof item?.translation === 'string' ? item.translation : '';
    if (Number.isInteger(index) && index >= 0 && index < count && text.trim() && !translations[index]) {
      translations[index] = text.trim();
    }
  });
  return translations.some(Boolean) ? translations : [];
}
