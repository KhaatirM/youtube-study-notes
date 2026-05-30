/** @typedef {'quick' | 'detailed' | 'cornell' | 'exam'} NoteMode */

export const NOTE_MODES = {
  quick: {
    id: 'quick',
    label: 'Quick summary',
    description: '5–10 bullets and key terms',
  },
  detailed: {
    id: 'detailed',
    label: 'Detailed study notes',
    description: 'Full outline with definitions and examples',
  },
  cornell: {
    id: 'cornell',
    label: 'Cornell notes',
    description: 'Cues, notes, and summary sections',
  },
  exam: {
    id: 'exam',
    label: 'Exam cram',
    description: 'Only testable facts and formulas',
  },
};

const BASE_RULES = `You are an expert study-note assistant. Use ONLY information from the transcript.
- If something is not in the transcript, write "Not covered in video."
- Include timestamps as [MM:SS] or [H:MM:SS] after section headings and important claims.
- Use clear Markdown: ## and ### headings, bullet lists, **bold** for key terms.
- Do not invent facts, citations, or quotes.`;

const MODE_INSTRUCTIONS = {
  quick: `Create a QUICK SUMMARY:
## Key takeaways
(5–10 bullets)
## Key terms
(term: one-line definition)
## Summary
(2–3 sentences)`,

  detailed: `Create DETAILED STUDY NOTES:
## What you should remember
(3–5 bullets)
## Main outline
(H2/H3 structure with definitions, examples, and [timestamps])
## Glossary
## Open questions
(3 questions the video leaves unanswered)`,

  cornell: `Create CORNELL-STYLE NOTES:
## Cues (questions / keywords)
## Notes (main content with timestamps)
## Summary
(paragraph)`,

  exam: `Create EXAM CRAM NOTES:
## Must-know facts
## Formulas / definitions
## Comparisons
## Likely exam questions (with brief answers)`,
};

/**
 * @param {NoteMode} mode
 * @param {{ title: string; channel: string; chapters?: { title: string; start: number }[] }} meta
 */
export function buildSystemPrompt(mode, meta) {
  const chapterHint =
    meta.chapters?.length > 0
      ? `\nVideo chapters: ${meta.chapters.map((c) => `${c.title} (${formatTs(c.start)})`).join('; ')}`
      : '';

  return `${BASE_RULES}

Video: "${meta.title}" by ${meta.channel}.${chapterHint}

${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.detailed}

Output valid Markdown only. No code fences wrapping the whole document.`;
}

/**
 * @param {{ text: string; start: number }[]} segments
 */
export function formatTranscriptForPrompt(segments) {
  return segments
    .map((s) => `[${formatTs(s.start)}] ${s.text.trim()}`)
    .join('\n');
}

export function formatTs(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function buildMergePrompt(mode, chunkNotes, meta) {
  return `${BASE_RULES}

Merge these partial study notes for "${meta.title}" into ONE coherent document.
Remove duplicates. Keep all timestamps. Use the same structure as ${mode} mode.

Partial notes:
${chunkNotes.map((n, i) => `--- Chunk ${i + 1} ---\n${n}`).join('\n\n')}`;
}
