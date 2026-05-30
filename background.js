import { parseTimedTextXml, dedupeSegments, selectCaptionTrack } from './lib/transcript.js';
import { chunkTranscript } from './lib/chunker.js';
import { generateStudyNotes } from './lib/llm.js';
import { getSettings, saveNoteToLibrary, getLibraryList } from './lib/storage.js';
import { buildMarkdownExport } from './lib/export-markdown.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'FETCH_TRANSCRIPT':
      return fetchTranscript(message.trackUrl);
    case 'GENERATE_NOTES':
      return generateNotes(message);
    case 'GET_SETTINGS':
      return { ok: true, settings: await getSettings() };
    case 'SAVE_NOTE':
      await saveNoteToLibrary(message.note);
      return { ok: true };
    case 'GET_LIBRARY':
      return { ok: true, library: await getLibraryList() };
    case 'BUILD_MARKDOWN':
      return {
        ok: true,
        markdown: buildMarkdownExport(message.payload),
      };
    case 'DOWNLOAD_FILE':
      return downloadFile(message.filename, message.content, message.mimeType);
    default:
      return { ok: false, error: 'Unknown message type' };
  }
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

async function generateNotes({ videoMeta, segments, mode }) {
  const settings = await getSettings();
  const apiKey =
    settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;

  if (!apiKey?.trim()) {
    throw new Error(
      'Add your API key in extension settings (click the puzzle icon → YouTube Study Notes → Options).'
    );
  }

  const chunks = chunkTranscript(segments);
  const config = {
    provider: settings.provider,
    apiKey: apiKey.trim(),
    model: settings.provider === 'gemini' ? settings.geminiModel : settings.openaiModel,
  };

  const notesMarkdown = await generateStudyNotes(
    mode || settings.noteMode,
    videoMeta,
    chunks,
    config
  );

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

  await saveNoteToLibrary(note);
  return { ok: true, notesMarkdown, note };
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
