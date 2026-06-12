import {
  buildOllamaSystemPrompt,
  buildOllamaUserPrompt,
  buildOllamaRetryUserPrompt,
  buildOllamaMergeUserPrompt,
  formatTranscriptForPrompt,
  isOllamaTemplateEcho,
} from './prompts.js';
import { chunkTranscript } from './chunker.js';

const OLLAMA_TIMEOUT_MS = 180000;
const MAX_PREDICT = 1400;

export async function generateOllamaNotes(mode, meta, segments, settings, onProgress) {
  const chunks = chunkTranscript(segments);
  const baseUrl = settings.ollamaBaseUrl || 'http://127.0.0.1:11434';
  const model = settings.ollamaModel || 'tinyllama';
  const systemPrompt = buildOllamaSystemPrompt(settings);

  await warmupOllama(baseUrl, model);

  const partialNotes = [];
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(i + 1, chunks.length, false);
    const transcriptBody = formatTranscriptForPrompt(chunks[i].segments);
    partialNotes.push(
      await generateOllamaChunk(
        baseUrl,
        model,
        systemPrompt,
        mode,
        meta,
        transcriptBody,
        i + 1,
        chunks.length,
        settings
      )
    );
  }

  if (partialNotes.length === 1) return partialNotes[0];

  if (onProgress) onProgress(chunks.length, chunks.length, true);
  const mergeUser = buildOllamaMergeUserPrompt(mode, meta, partialNotes);
  const merged = await callOllama(baseUrl, model, systemPrompt, mergeUser);
  if (isOllamaTemplateEcho(merged)) {
    return partialNotes.join('\n\n---\n\n');
  }
  return merged;
}

async function generateOllamaChunk(
  baseUrl,
  model,
  systemPrompt,
  mode,
  meta,
  transcriptBody,
  chunkIndex,
  chunkTotal,
  settings
) {
  const userContent = buildOllamaUserPrompt(mode, meta, transcriptBody, chunkIndex, chunkTotal, settings);
  let text = await callOllama(baseUrl, model, systemPrompt, userContent);
  if (!isOllamaTemplateEcho(text)) return text;

  const retryUser = buildOllamaRetryUserPrompt(meta, transcriptBody);
  text = await callOllama(baseUrl, model, systemPrompt, retryUser, OLLAMA_TIMEOUT_MS, MAX_PREDICT);
  if (!isOllamaTemplateEcho(text)) return text;

  throw new Error(
    'Ollama returned an outline instead of real notes (common with tinyllama). In Settings try model llama3.2:1b, or run: ollama pull llama3.2:1b — then reload and generate again.'
  );
}

async function warmupOllama(baseUrl, model) {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), 5000);
    await fetch(`${base}/api/tags`, { signal: c.signal });
    await callOllama(base, model, 'Reply with OK only.', 'Say OK', 8000, 16);
  } catch {
    /* warmup optional */
  }
}

async function callOllama(
  baseUrl,
  model,
  systemPrompt,
  userContent,
  timeoutMs = OLLAMA_TIMEOUT_MS,
  maxTokens = MAX_PREDICT
) {
  const base = baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        options: {
          temperature: 0.35,
          num_predict: maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 403) {
        throw new Error(
          'Ollama HTTP 403 (blocked Origin). Reload the extension at chrome://extensions, restart Ollama, then try again.'
        );
      }
      let detail = err.trim();
      try {
        const j = JSON.parse(err);
        if (typeof j.error === 'string') detail = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(detail ? `Ollama: ${detail.slice(0, 280)}` : `Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.message?.content?.trim() || '';
    if (!text) {
      throw new Error('Ollama returned an empty response. Check the model name in Settings (use tinyllama).');
    }
    return text;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(
        `Ollama timed out after ${Math.round(timeoutMs / 1000)}s. Use model "tinyllama", close other apps, or restart Ollama.`
      );
    }
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      throw new Error(
        'Cannot reach Ollama. Open the Ollama app and ensure the model is downloaded (ollama pull tinyllama).'
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
