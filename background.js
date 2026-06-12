import { parseTimedTextXml, dedupeSegments, selectCaptionTrack } from './lib/transcript.js';
import { chunkTranscript } from './lib/chunker.js';
import { generateStudyNotes } from './lib/llm.js';
import {
  getSettings,
  saveNoteToLibrary,
  getLibraryList,
  deleteNoteFromLibrary,
  getNoteVersions,
  exportLibraryBackup,
  importLibraryBackup,
  getUiFlags,
} from './lib/storage.js';
import { buildMarkdownExport } from './lib/export-markdown.js';
import { generateOllamaNotes } from './lib/ollama-generate.js';
import {
  fetchPlaylistVideoIds,
  runBatchGeneration,
  cancelBatch,
} from './lib/batch.js';
import { buildAnkiCsv } from './lib/export-anki.js';
import { EXTENSION_VERSION } from './lib/changelog.js';
import { setUiFlags } from './lib/storage.js';

const OLLAMA_CORS_RULE_IDS = [1, 2];

/** Ollama rejects chrome-extension:// Origin; rewrite to localhost (Page Assist pattern). */
async function applyOllamaCorsFix() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: OLLAMA_CORS_RULE_IDS,
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'http://localhost' },
            ],
          },
          condition: {
            urlFilter: 'localhost:11434',
            resourceTypes: ['xmlhttprequest'],
          },
        },
        {
          id: 2,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'http://localhost' },
            ],
          },
          condition: {
            urlFilter: '127.0.0.1:11434',
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    });
  } catch (e) {
    console.warn('Could not apply Ollama CORS header rules:', e);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  applyOllamaCorsFix();
  const version = chrome.runtime.getManifest().version;
  if (details.reason === 'install') {
    setUiFlags({ showOnboarding: true, showChangelog: false, lastSeenVersion: version });
  } else if (details.reason === 'update') {
    setUiFlags({ showChangelog: true, showOnboarding: false, lastSeenVersion: version });
  }
});

applyOllamaCorsFix();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'YSN_OPEN_PANEL' });
  } catch {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content/content.css'],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/transcript-fetch.js', 'content/content.js'],
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'YSN_OPEN_PANEL' });
    } catch {
      /* not on YouTube */
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let replied = false;
  const reply = (payload) => {
    if (replied) return;
    replied = true;
    try {
      sendResponse(payload);
    } catch {
      /* channel already closed */
    }
  };
  handleMessage(message, sender)
    .then(reply)
    .catch((err) => reply({ ok: false, error: err.message || String(err) }));
  return true;
});

function startKeepAlive() {
  return setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ysn-ollama-generate') return;

  const ticker = startKeepAlive();
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'GENERATE') return;
    try {
      const notesMarkdown = await generateOllamaNotes(
        msg.mode,
        msg.videoMeta,
        msg.segments,
        msg.settings,
        (part, total, merging) => {
          try {
            port.postMessage({ type: 'progress', part, total, merging });
          } catch {
            /* disconnected */
          }
        }
      );
      port.postMessage({ type: 'done', ok: true, notesMarkdown });
    } catch (e) {
      port.postMessage({ type: 'done', ok: false, error: e.message || String(e) });
    } finally {
      clearInterval(ticker);
    }
  });
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'FETCH_TRANSCRIPT':
      return fetchTranscript(message.trackUrl);
    case 'GENERATE_NOTES':
      return generateNotes(message, sender);
    case 'GET_SETTINGS':
      return { ok: true, settings: await getSettings() };
    case 'SAVE_NOTE':
      await saveNoteToLibrary(message.note, {
        archivePrevious: Boolean(message.archivePrevious),
      });
      return { ok: true };
    case 'DELETE_NOTE':
      await deleteNoteFromLibrary(message.videoId);
      return { ok: true, library: await getLibraryList() };
    case 'GET_LIBRARY':
      return { ok: true, library: await getLibraryList() };
    case 'GET_NOTE_VERSIONS':
      return { ok: true, versions: await getNoteVersions(message.videoId) };
    case 'EXPORT_LIBRARY':
      return { ok: true, backup: await exportLibraryBackup() };
    case 'IMPORT_LIBRARY':
      return { ok: true, ...(await importLibraryBackup(message.backup)) };
    case 'CHECK_OLLAMA':
      return checkOllamaStatus(message.settings || (await getSettings()));
    case 'BUILD_MARKDOWN':
      return {
        ok: true,
        markdown: buildMarkdownExport(message.payload),
      };
    case 'DOWNLOAD_FILE':
      return downloadFile(message.filename, message.content, message.mimeType);
    case 'GET_PLAYLIST_VIDEOS':
      return {
        ok: true,
        videoIds: await fetchPlaylistVideoIds(message.listId, message.limit || 20),
      };
    case 'BATCH_GENERATE':
      return runBatchJob(message, sender);
    case 'BATCH_CANCEL':
      cancelBatch();
      return { ok: true };
    case 'BUILD_ANKI_CSV':
      return {
        ok: true,
        csv: buildAnkiCsv(message.notesMarkdown, message.deckName),
      };
    case 'COMPLETE_ONBOARDING':
      await chrome.storage.sync.set({ onboardingComplete: true });
      await setUiFlags({ showOnboarding: false });
      return { ok: true };
    case 'DISMISS_CHANGELOG':
      await setUiFlags({ showChangelog: false });
      return { ok: true };
    case 'GET_UI_FLAGS':
      return { ok: true, version: EXTENSION_VERSION, ...(await getUiFlags()) };
    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

async function runBatchJob(message, sender) {
  const tabId = sender?.tab?.id;
  const onProgress = (p) => {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'BATCH_PROGRESS', ...p }).catch(() => {});
  };
  return runBatchGeneration({
    videoIds: message.videoIds,
    mode: message.mode,
    onProgress,
  });
}

async function fetchTranscript(trackUrl) {
  const base = trackUrl.replace(/&fmt=[^&]+/g, '');
  const urls = [
    `${base}${base.includes('?') ? '&' : '?'}fmt=json3`,
    base,
  ];

  let text = '';
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    text = await res.text();
    if (text.trim()) break;
  }
  if (!text.trim()) throw new Error('Could not fetch captions for this video.');

  let segments;
  if (text.trim().startsWith('{')) {
    segments = parseJson3Transcript(text);
  } else {
    segments = parseTimedTextXml(text);
  }
  segments = dedupeSegments(segments);
  if (!segments.length) throw new Error('Transcript is empty.');
  return { ok: true, segments };
}

function parseJson3Transcript(jsonText) {
  const data = JSON.parse(jsonText);
  const events = data.events || [];
  const segments = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const t = (ev.tStartMs || 0) / 1000;
    const line = ev.segs.map((s) => s.utf8 || '').join('').trim();
    if (line) segments.push({ text: line, start: t, duration: (ev.dDurationMs || 0) / 1000 });
  }
  return segments;
}

async function generateNotes({ videoMeta, segments, mode }, sender) {
  const settings = await getSettings();
  const provider = settings.provider || 'ollama';

  if (provider === 'openai' && !settings.openaiApiKey?.trim()) {
    throw new Error('MISSING_API_KEY');
  }
  if (provider === 'gemini' && !settings.geminiApiKey?.trim()) {
    throw new Error('MISSING_API_KEY');
  }

  const chunks = chunkTranscript(segments);
  const config = {
    provider,
    apiKey:
      provider === 'gemini'
        ? settings.geminiApiKey?.trim()
        : provider === 'openai'
          ? settings.openaiApiKey?.trim()
          : '',
    model:
      provider === 'gemini'
        ? settings.geminiModel
        : provider === 'ollama'
          ? settings.ollamaModel
          : settings.openaiModel,
    baseUrl: settings.ollamaBaseUrl,
    tabId: sender?.tab?.id,
  };

  const ticker = startKeepAlive();
  let notesMarkdown;
  try {
    if (provider === 'ollama') {
      notesMarkdown = await generateOllamaNotes(
        mode || settings.noteMode,
        videoMeta,
        segments,
        settings
      );
    } else {
      notesMarkdown = await generateStudyNotes(mode || settings.noteMode, videoMeta, chunks, {
        ...config,
        settings,
      });
    }
  } finally {
    clearInterval(ticker);
  }

  const note = {
    videoId: videoMeta.videoId,
    title: videoMeta.title,
    channel: videoMeta.channel,
    thumbnail: videoMeta.thumbnail,
    mode: mode || settings.noteMode,
    notesMarkdown,
    segments,
    updatedAt: Date.now(),
  };

  await saveNoteToLibrary(note, { archivePrevious: true });
  return { ok: true, notesMarkdown, note };
}

async function checkOllamaStatus(settings) {
  const base = (settings.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = settings.ollamaModel || 'llama3.2:1b';
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), 4000);
    const res = await fetch(`${base}/api/tags`, { signal: c.signal });
    if (!res.ok) {
      return { ok: false, online: false, message: `Ollama HTTP ${res.status}` };
    }
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name || m.model || '').filter(Boolean);
    const hasModel = names.some((n) => n === model || n.startsWith(`${model}:`));
    return {
      ok: true,
      online: true,
      hasModel,
      model,
      message: hasModel
        ? `Ollama ready · ${model}`
        : `Ollama online — run: ollama pull ${model}`,
    };
  } catch {
    return {
      ok: false,
      online: false,
      message: 'Ollama not reachable — open the Ollama app',
    };
  }
}

async function downloadFile(filename, content, mimeType = 'text/plain') {
  const dataUrl =
    'data:' +
    mimeType +
    ';charset=utf-8,' +
    encodeURIComponent(content);
  const id = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });
  return { ok: true, downloadId: id };
}
