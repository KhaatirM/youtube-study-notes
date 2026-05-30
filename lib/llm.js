import {
  buildSystemPrompt,
  formatTranscriptForPrompt,
  buildMergePrompt,
} from './prompts.js';

/**
 * @param {import('./prompts.js').NoteMode} mode
 * @param {{ title: string; channel: string; chapters?: object[] }} meta
 * @param {{ segments: { text: string; start: number }[] }[]} chunks
 * @param {{ provider: 'openai' | 'gemini'; apiKey: string; model?: string }} config
 */
export async function generateStudyNotes(mode, meta, chunks, config) {
  const systemPrompt = buildSystemPrompt(mode, meta);
  const partialNotes = [];

  for (let i = 0; i < chunks.length; i++) {
    const userContent = `Transcript section ${i + 1} of ${chunks.length}:\n\n${formatTranscriptForPrompt(chunks[i].segments)}`;
    const part = await callLlm(config, systemPrompt, userContent);
    partialNotes.push(part);
  }

  if (partialNotes.length === 1) return partialNotes[0];

  const mergeSystem = buildSystemPrompt(mode, meta);
  const mergeUser = buildMergePrompt(mode, partialNotes, meta);
  return callLlm(config, mergeSystem, mergeUser);
}

/**
 * @param {{ provider: 'openai' | 'gemini'; apiKey: string; model?: string }} config
 */
async function callLlm(config, systemPrompt, userContent) {
  if (config.provider === 'gemini') {
    return callGemini(config, systemPrompt, userContent);
  }
  return callOpenAI(config, systemPrompt, userContent);
}

async function callOpenAI(config, systemPrompt, userContent) {
  const model = config.model || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseApiError(err, 'OpenAI'));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(config, systemPrompt, userContent) {
  const model = config.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseApiError(err, 'Gemini'));
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

function parseApiError(raw, provider) {
  try {
    const j = JSON.parse(raw);
    const msg =
      j.error?.message ||
      j.error?.message?.[0]?.message ||
      j[0]?.error?.message;
    if (msg) return `${provider}: ${msg}`;
  } catch {
    /* ignore */
  }
  return `${provider} request failed: ${raw.slice(0, 200)}`;
}
