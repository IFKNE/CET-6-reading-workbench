import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '未提供';
}

function sourceText(sources) {
  const rows = Object.values(sources ?? {});
  return rows.length
    ? rows.map((source) => `${text(source.title)}（${Number(source.count) || 0} 次）`).join('；')
    : '未关联精读文章';
}

function wordSection(entry) {
  const phrases = Array.isArray(entry.phrases) ? entry.phrases : [];
  const children = [
    new Paragraph({ text: text(entry.word), heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ bold: true, text: '释义：' }), new TextRun(`${text(entry.partOfSpeech)} ${text(entry.meaning)}`)] }),
    new Paragraph({ children: [new TextRun({ bold: true, text: '来源：' }), new TextRun(sourceText(entry.sources))] })
  ];
  if (phrases.length) {
    children.push(new Paragraph({ children: [new TextRun({ bold: true, text: '常用短语：' }), new TextRun(phrases.map((item) => `${text(item.phrase)}：${text(item.meaning)}`).join('；'))] }));
  }
  if (entry.example?.english) {
    children.push(new Paragraph({ children: [new TextRun({ bold: true, text: '例句：' }), new TextRun(`${entry.example.english}\n${text(entry.example.chinese)}`)] }));
  }
  children.push(new Paragraph({ children: [new TextRun({ bold: true, text: '原句：' }), new TextRun(text(entry.context))] }));
  return children;
}

export async function createWordbookDocument(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: '六级精读单词本', heading: HeadingLevel.TITLE }),
        new Paragraph(`导出日期：${new Date().toISOString().slice(0, 10)}`),
        ...safeEntries.flatMap(wordSection)
      ]
    }]
  });
  return Packer.toBuffer(document);
}
