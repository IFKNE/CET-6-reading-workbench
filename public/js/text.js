// 段落判定的排版阈值：折行只出现在“排满整行”的印刷体文本里。
const MAX_TYPESET_WIDTH = 120;
const FILLED_LINE_RATIO = 0.85;
const FILLED_LINE_SHARE = 0.4;
const OPEN_ENDED_LINE_SHARE = 0.5;

// 句子结束标点。不含冒号、分号和逗号，因为它们后面通常还是同一句的续行。
const SENTENCE_END = /[.!?。！？…]["'”’)\]】」』]*$/;
// 续行开头：小写字母，可带一个引号或左括号。
const CONTINUATION_START = /^["'“”‘’([«]?[a-z]/;
// 结构标记：说话人、题号、选项、项目符号与题型说明，出现即另起一段。
const PARAGRAPH_MARKERS = [
  /^[A-Za-z][A-Za-z0-9 .'’-]{0,20}:\s/,
  /^\(?\d{1,2}\s*[.)、]\s*/,
  /^[A-D]\s*[.)]\s+/,
  /^[•·▪◦※*\-–—]\s+/,
  /^(?:questions?|sections?|passages?|parts?|directions?|conversations?|news reports?|lectures?|talks?|interviews?|recordings?|speakers?|narrator)\b/i
];

function isParagraphMarker(line) {
  return PARAGRAPH_MARKERS.some((pattern) => pattern.test(line));
}

function endsSentence(line) {
  return SENTENCE_END.test(line);
}

function widestLine(lines) {
  return lines.reduce((width, line) => Math.max(width, line.length), 0);
}

function isFilledLine(line, width) {
  return width > 0 && line.length >= width * FILLED_LINE_RATIO;
}

// 一整块没有空行的文本：判断它是“每行自成一段”，还是“同一段被排版折行”。
function looksHardWrapped(lines) {
  if (lines.length < 2) return false;
  const width = widestLine(lines);
  if (width < 40 || width > MAX_TYPESET_WIDTH) return false;
  const filled = lines.filter((line) => isFilledLine(line, width)).length;
  if (filled / lines.length < FILLED_LINE_SHARE) return false;
  const body = lines.slice(0, -1);
  const openEnded = body.filter((line) => !endsSentence(line)).length;
  return openEnded / body.length >= OPEN_ENDED_LINE_SHARE;
}

function shouldJoinLines(previous, next, { wrapped, width }) {
  // 听力说话人、题号、选项这类标记本身就是分段依据，优先断段。
  if (isParagraphMarker(next)) return false;
  // 上一行没说完：下一行开头是小写字母即为续行。
  if (!endsSentence(previous)) return CONTINUATION_START.test(next) || wrapped;
  // 上一行已经说完一句：只有排满整行时才当作折行，否则是真正的分段。
  return wrapped && isFilledLine(previous, width);
}

function joinBlock(lines) {
  if (!lines.length) return [];
  const width = widestLine(lines);
  const wrapped = looksHardWrapped(lines);
  const paragraphs = [lines[0]];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (shouldJoinLines(previous, current, { wrapped, width })) {
      paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${current}`;
    } else {
      paragraphs.push(current);
    }
  }
  return paragraphs;
}

export function splitParagraphs(article) {
  const lines = String(article ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());
  const paragraphs = [];
  let block = [];
  for (const line of lines) {
    if (!line) {
      paragraphs.push(...joinBlock(block));
      block = [];
      continue;
    }
    block.push(line);
  }
  paragraphs.push(...joinBlock(block));
  return paragraphs;
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
