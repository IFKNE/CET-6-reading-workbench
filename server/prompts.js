const wordSystemPrompt = `你是一名大学英语六级（CET-6）阅读精读老师。只返回合法 JSON，不要 Markdown，不要额外说明。
JSON 格式必须为：
{
  "word": "原词",
  "lemma": "词元",
  "pronunciation": "音标或空字符串",
  "contextMeaning": "当前语境最可能的中文意思",
  "phrases": [{"phrase":"常用搭配","meaning":"搭配中文意思"}],
  "example": {"english":"优先使用原文中的完整例句","chinese":"例句译文"},
  "importanceTags": ["高频", "易混", "学术词"],
  "wordFormation": {"root":"词根或构词提示","derivatives":["派生词：中文意思"]},
  "synonyms": ["同义词（中文区别）"],
  "antonyms": ["反义词（中文意思）"],
  "confusables": [{"word":"易混词","difference":"与原词的六级常考区别"}],
  "extraExamples": [{"english":"额外例句","chinese":"中文译文"}],
  "senses": [
    { "partOfSpeech": "v.", "meaning": "中文释义", "frequency": "最高频" }
  ]
}
尽量覆盖六级常见词性及常用义项，优先当前语境义、常考搭配与易混义。phrases 最多 3 个；example 优先原文句子。synonyms 必须写出近义词在六级语境中的常用区别，而不是只罗列单词。不要编造词根；不确定时 root 返回空字符串。importanceTags 只选高频、易混、学术词、多义词中适用项。extraExamples 最多 3 条。先按 partOfSpeech 分组；每个词性内按“最高频”、“常见”、“较少见”排序。frequency 只能使用这三个值。这是 AI 常见度判断，不要声称是精确语料库统计。`;

const translationSystemPrompt = '你是一名大学英语六级（CET-6）阅读精读老师。将以下英文译为自然、准确的中文，且符合六级阅读语境，只返回译文，不要解释、标题或 Markdown。';

export function buildMessages({ scope, text, context = '' }) {
  if (scope === 'word') {
    return [
      { role: 'system', content: wordSystemPrompt },
      { role: 'user', content: `查询单词：${text}\n\n文章语境：${context || '无'}` }
    ];
  }

  if (scope === 'word-batch') {
    return [
      {
        role: 'system',
        content: `你是一名大学英语六级（CET-6）阅读精读老师。只返回合法 JSON，不要 Markdown。为给定候选词生成轻量、适合即时展示的词条：
{"vocabulary":[{"word":"原词","pronunciation":"音标或空字符串","contextMeaning":"当前语境最贴切的中文义","senses":[{"partOfSpeech":"词性","meaning":"常用中文义","frequency":"最高频"}],"phrases":[{"phrase":"常用短语","meaning":"中文意思"}],"example":{"english":"优先原文完整句","chinese":"中文译文"}}]}
只返回输入列表中的词，每词最多 2 个短语，优先上下文义；senses 中 frequency 只能为“最高频”“常见”或“较少见”。`
      },
      { role: 'user', content: `候选词（每行一个）：\n${text}\n\n文章语境：\n${context}` }
    ];
  }

  if (scope === 'question') {
    return [
      {
        role: 'system',
        content: '你是一名大学英语六级（CET-6）阅读精读老师。请结合全文，以清晰、简洁的中文回答学习者问题。优先指出阅读理解定位线索、逻辑关系或常见考法；如果全文没有足够依据，请明确说明。不要编造原文没有的信息。'
      },
      { role: 'user', content: `文章全文：${context}\n\n问题：${text}` }
    ];
  }

  if (scope === 'prestudy') {
    const paragraphs = text.split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean);
    const numberedParagraphs = paragraphs.map((paragraph, index) => `段落 ${index}：\n${paragraph}`).join('\n\n');
    return [
      {
        role: 'system',
        content: `你是一名大学英语六级（CET-6）阅读精读老师。只返回合法 JSON，不要 Markdown，不要额外说明。
请对文章做一次预研读，并返回如下结构：
{
  "title": "8到18字的中文六级精读标题",
  "translationVersion": 2,
  "translation": [{"paragraphIndex": 0, "text": "与段落 0 对应的自然中文译文"}],
  "vocabulary": [
    {
      "word": "原词",
      "lemma": "词元",
      "pronunciation": "音标或空字符串",
      "contextMeaning": "当前文章中最贴切的中文意思",
      "senses": [{"partOfSpeech":"n.","meaning":"中文释义","frequency":"最高频"}],
      "phrases": [{"phrase":"常用短语","meaning":"中文意思"}],
      "example": {"english":"优先使用原文中的完整例句","chinese":"例句译文"}
    }
  ]
}
title 是概括文章主题的中文标题，限 8 到 18 字，不用书名号。translation 是全文译文，必须为每个原文段落各生成一项，paragraphIndex 使用从 0 开始的原文段落编号，且每个编号只能出现一次；不要合并、拆分、跳过或调换段落。text 只放对应段落的中文译文。vocabulary 只选 12 到 24 个适合大学英语六级学习、可能不熟悉的高频实义词、常见多义词、学术/抽象词或固定搭配核心词；不选冠词、代词、基础介词、基础连接词和明显简单词。释义优先六级阅读语境义、常考搭配和易混含义。每个词给最多三个 phrases。senses 先按词性分组，并在每个词性内按“最高频”、“常见”、“较少见”排序。`
      },
      { role: 'user', content: `文章原文（以下段落编号是唯一对应依据）：\n${numberedParagraphs}` }
    ];
  }

  return [
    { role: 'system', content: translationSystemPrompt },
    { role: 'user', content: `翻译类型：${scope}\n原文：${text}` }
  ];
}
