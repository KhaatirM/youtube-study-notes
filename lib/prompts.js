/** @typedef {'quick' | 'detailed' | 'cornell' | 'exam' | 'quiz'} NoteMode */

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
  quiz: {
    id: 'quiz',
    label: 'Flashcards & quiz',
    description: 'Q&A and flashcards from the transcript',
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

  quiz: `Create FLASHCARDS & QUIZ from the transcript only:
## Flashcards
(10-15 lines: **Term** → answer, or **Question** → short answer)
## Practice quiz
(8-10 numbered questions with brief answers underneath each)
## Self-check
(3 harder questions with answers)`,
};

const OUTPUT_LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  hi: 'Hindi',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  it: 'Italian',
};

export function getOutputLanguageLine(settings) {
  const code = settings?.outputLanguage || 'en';
  const name = OUTPUT_LANGUAGE_NAMES[code] || code;
  return `\nWrite all study notes in ${name}.`;
}

export function getCustomPromptAppend(settings) {
  const text = settings?.customPromptAppend?.trim();
  if (!text) return '';
  return `\n\nUser template (follow when compatible):\n${text}`;
}

function formatChapterBlock(meta) {
  if (!meta.chapters?.length) return '';
  return (
    '\nOrganize notes using these video chapters (use chapter titles as ## headings with [timestamps]):\n' +
    meta.chapters.map((c) => `- ${c.title} (starts ${formatTs(c.start)})`).join('\n')
  );
}

/**
 * @param {NoteMode} mode
 * @param {{ title: string; channel: string; chapters?: { title: string; start: number }[] }} meta
 */
export function buildSystemPrompt(mode, meta, settings = null) {
  const chapterHint = formatChapterBlock(meta);
  const lang = settings ? getOutputLanguageLine(settings) : '';
  const custom = settings ? getCustomPromptAppend(settings) : '';

  return `${BASE_RULES}

Video: "${meta.title}" by ${meta.channel}.${chapterHint}${lang}

${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.detailed}

Output valid Markdown only. No code fences wrapping the whole document.${custom}`;
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

/** Short system line — small Ollama models ignore long system prompts. */
export function buildOllamaSystemPrompt(settings = null) {
  const lang = settings ? getOutputLanguageLine(settings) : '';
  const custom = settings ? getCustomPromptAppend(settings) : '';
  return (
    'You write study notes from video transcripts. Use only facts from the user transcript. ' +
    'Output Markdown with real content. Never repeat outlines or placeholders like "(5-10 bullets)".' +
    lang +
    custom
  );
}

const OLLAMA_MODE_TASKS = {
  quick:
    'Write: ## Key takeaways (5-10 bullets with facts), ## Key terms (term: definition), ## Summary (2-3 sentences).',
  detailed:
    'Write: ## What you should remember, ## Main outline (with [timestamps]), ## Glossary, ## Open questions.',
  cornell: 'Write: ## Cues, ## Notes (with timestamps), ## Summary.',
  exam: 'Write: ## Must-know facts, ## Formulas / definitions, ## Likely exam questions.',
  quiz: 'Write: ## Flashcards (10+ Q/A or term/definition), ## Practice quiz (numbered Q with answers), ## Self-check.',
};

function ollamaChapterLine(meta) {
  if (!meta.chapters?.length) return '';
  return (
    '\nChapters: ' +
    meta.chapters.map((c) => `${c.title} @ ${formatTs(c.start)}`).join('; ') +
    '. Use chapter titles as section headings.'
  );
}

/**
 * Single user message for Ollama — transcript + task together (works better on tiny models).
 */
export function buildOllamaUserPrompt(
  mode,
  meta,
  transcriptBody,
  chunkIndex = 1,
  chunkTotal = 1,
  settings = null
) {
  const task = OLLAMA_MODE_TASKS[mode] || OLLAMA_MODE_TASKS.detailed;
  const part = chunkTotal > 1 ? ` (section ${chunkIndex}/${chunkTotal})` : '';
  const lang = settings ? getOutputLanguageLine(settings) : '';
  return `Video: "${meta.title}" by ${meta.channel}${part}${ollamaChapterLine(meta)}${lang}

Task: ${task}
Rules: Facts must come from the transcript below. Add [MM:SS] timestamps. Do not copy this task text.

TRANSCRIPT:
---
${transcriptBody}
---

Write the study notes in Markdown now:`;
}

export function buildOllamaRetryUserPrompt(meta, transcriptBody) {
  return `Write Markdown study notes for the video "${meta.title}".

Use ONLY this transcript. Include bullet takeaways, key terms, and a short summary. No empty templates.

TRANSCRIPT:
${transcriptBody}`;
}

export function buildOllamaMergeUserPrompt(mode, meta, partialNotes) {
  const task = OLLAMA_MODE_TASKS[mode] || OLLAMA_MODE_TASKS.detailed;
  return `Merge these partial notes for "${meta.title}" into one document.
${task}

${partialNotes.map((n, i) => `--- Part ${i + 1} ---\n${n}`).join('\n\n')}`;
}

/** Detect when tiny models echo the prompt skeleton instead of writing notes. */
export function isOllamaTemplateEcho(text) {
  if (!text?.trim()) return true;
  const t = text.toLowerCase();
  const placeholders = [
    '(5–10 bullets)',
    '(5-10 bullets)',
    '(2–3 sentences)',
    '(2-3 sentences)',
    '(term: one-line definition)',
    'one-line definition',
    '(4-6 bullet',
    'transcript section 1 of 1:',
  ];
  let ph = 0;
  for (const p of placeholders) {
    if (t.includes(p.toLowerCase())) ph++;
  }
  if (ph >= 1 && t.includes('## key') && t.split(/\s+/).length < 120) return true;
  if (ph >= 2) return true;
  const bullets = (text.match(/^[\s]*[-*]\s+\S+/gm) || []).filter((line) => {
    const body = line.replace(/^[\s]*[-*]\s+/, '');
    return body.length > 12 && !/^\(.*\)$/.test(body.trim());
  });
  if (/##\s/.test(text) && bullets.length < 2 && text.split(/\s+/).length < 100) return true;
  return false;
}
