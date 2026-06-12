/**
 * Parse quiz/flashcard markdown into Anki-compatible CSV (front, back).
 * @param {string} notesMarkdown
 * @param {string} deckName
 */
export function buildAnkiCsv(notesMarkdown, deckName = 'YouTube Study Notes') {
  const pairs = extractQaPairs(notesMarkdown);
  const header = ['Front', 'Back', 'Tags'];
  const tag = deckName.replace(/"/g, '""');
  const rows = pairs.map(([front, back]) => [
    escapeCsv(front),
    escapeCsv(back),
    escapeCsv(tag),
  ]);
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function extractQaPairs(md) {
  const pairs = [];
  const lines = md.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const arrow = trimmed.match(/^\*\*(.+?)\*\*\s*[→:–-]\s*(.+)$/);
    if (arrow) {
      pairs.push([arrow[1].trim(), arrow[2].trim()]);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s*\*\*(.+?)\*\*\s*(.+)$/);
    if (numbered) {
      pairs.push([numbered[1].trim(), numbered[2].trim()]);
      continue;
    }

    const bulletQ = trimmed.match(/^[-*]\s*\*\*(.+?)\*\*\s*[→:–-]\s*(.+)$/);
    if (bulletQ) {
      pairs.push([bulletQ[1].trim(), bulletQ[2].trim()]);
    }
  }

  if (pairs.length < 3) {
    const chunks = md.split(/\n\n+/).filter((p) => p.trim().length > 20);
    for (const chunk of chunks.slice(0, 15)) {
      const firstLine = chunk.split('\n').find((l) => l.trim()) || '';
      const rest = chunk.replace(firstLine, '').trim();
      if (firstLine && rest) pairs.push([firstLine.replace(/^#+\s*/, ''), rest.slice(0, 500)]);
    }
  }

  return pairs.slice(0, 40);
}

function escapeCsv(s) {
  const t = String(s).replace(/"/g, '""').replace(/\n/g, ' ');
  return `"${t}"`;
}
