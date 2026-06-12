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
  const systemPrompt = buildSystemPrompt(mode, meta, config.settings);
  const partialNotes = [];

  for (let i = 0; i < chunks.length; i++) {
    const userContent = `Transcript section ${i + 1} of ${chunks.length}:\n\n${formatTranscriptForPrompt(chunks[i].segments)}`;
    const part = await callLlm(config, systemPrompt, userContent);
    partialNotes.push(part);
  }

  if (partialNotes.length === 1) return partialNotes[0];

  const mergeSystem = buildSystemPrompt(mode, meta, config.settings);
  const mergeUser = buildMergePrompt(mode, partialNotes, meta);
  return callLlm(config, mergeSystem, mergeUser);
}

/**
 * @param {{ provider: 'openai' | 'gemini'; apiKey: string; model?: string }} config
 */
async function callLlm(config, systemPrompt, userContent) {
  if (config.provider === 'gemini') return callGemini(config, systemPrompt, userContent);
  if (config.provider === 'ollama') return callOllama(config, systemPrompt, userContent);
  return callOpenAI(config, systemPrompt, userContent);
}

async function callOllama(config, systemPrompt, userContent) {
  if (config.tabId) {
    return callOllamaViaTab(config.tabId, config, systemPrompt, userContent);
  }
  return callOllamaFetch(config, systemPrompt, userContent);
}

async function callOllamaViaTab(tabId, config, systemPrompt, userContent) {
  const res = await chrome.tabs.sendMessage(tabId, {
    type: 'OLLAMA_CHAT',
    baseUrl: config.baseUrl,
    model: config.model,
    systemPrompt,
    userContent,
  });
  if (!res?.ok) throw new Error(res.error || 'Ollama request failed.');
  return res.text;
}

async function callOllamaFetch(config, systemPrompt, userContent) {
  const base = (config.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = config.model || 'tinyllama';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:11434',
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  return parseOllamaResponse(res);
}

async function parseOllamaResponse(res) {
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 403) {
      throw new Error(
        'Ollama blocked the request (HTTP 403). Run scripts/setup-ollama-cors.ps1, restart Ollama, reload the extension, then refresh YouTube.'
      );
    }
    if (res.status === 0 || err.includes('Failed to fetch')) {
      throw new Error('Ollama: Cannot reach Ollama. Open the Ollama app from the Start menu.');
    }
    if (!err.trim()) {
      throw new Error(`Ollama: Request failed (HTTP ${res.status}). Is the Ollama app running?`);
    }
    throw new Error(parseApiError(err, 'Ollama'));
  }

  const data = await res.json();
  return data.message?.content?.trim() || '';
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
    const errStr = typeof j.error === 'string' ? j.error : null;
    if (errStr) {
      if (/unable to allocate|out of memory|RAM/i.test(errStr)) {
        return `${provider}: Not enough memory to load the model. In Settings use a smaller model (e.g. llama3.2:1b), close other apps, then try again.`;
      }
      return `${provider}: ${errStr.slice(0, 300)}`;
    }
    const msg =
      j.error?.message ||
      j.error?.message?.[0]?.message ||
      j[0]?.error?.message;
    if (msg) return `${provider}: ${msg}`;
  } catch {
    /* ignore */
  }
  return `${provider} request failed: ${raw.slice(0, 300)}`;
}
