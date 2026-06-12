import { getSettings } from './storage.js';
import { generateOllamaNotes } from './ollama-generate.js';
import { generateStudyNotes } from './llm.js';
import { chunkTranscript } from './chunker.js';
import { saveNoteToLibrary } from './storage.js';
import { getCaptionTracks, selectCaptionTrack, parseTimedTextXml, dedupeSegments } from './transcript.js';

let batchCancel = false;

export function cancelBatch() {
  batchCancel = true;
}

export async function fetchPlaylistVideoIds(listId, maxVideos = 30) {
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load playlist page.');
  const html = await res.text();
  const ids = [];
  const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
    if (ids.length >= maxVideos) break;
  }
  if (!ids.length) throw new Error('No videos found in this playlist.');
  return ids;
}

export async function fetchVideoMetaOembed(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    return {
      videoId,
      title: 'Untitled',
      channel: 'Unknown',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      chapters: [],
    };
  }
  const data = await res.json();
  return {
    videoId,
    title: data.title || 'Untitled',
    channel: data.author_name || 'Unknown',
    thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    chapters: [],
  };
}

async function fetchTranscriptForVideo(videoId, language) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl);
  const html = await res.text();
  const pr = extractPlayerResponse(html);
  if (!pr) throw new Error('No player data');
  const tracks = getCaptionTracks(pr);
  if (!tracks.length) throw new Error('No captions');
  const track = selectCaptionTrack(tracks, language || 'en');
  const trackUrl = track?.baseUrl || track?.url;
  if (!trackUrl) throw new Error('No caption URL');

  const base = trackUrl.replace(/&fmt=[^&]+/g, '');
  const capRes = await fetch(`${base}${base.includes('?') ? '&' : '?'}fmt=json3`);
  const text = await capRes.text();
  let segments;
  if (text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    segments = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue;
      const t = (ev.tStartMs || 0) / 1000;
      const line = ev.segs.map((s) => s.utf8 || '').join('').trim();
      if (line) segments.push({ text: line, start: t, duration: 0 });
    }
  } else {
    segments = parseTimedTextXml(text);
  }
  segments = dedupeSegments(segments);
  if (!segments.length) throw new Error('Empty transcript');
  return segments;
}

/**
 * @param {{ videoIds: string[]; mode: string; onProgress: (p: object) => void }} opts
 */
export async function runBatchGeneration({ videoIds, mode, onProgress }) {
  batchCancel = false;
  const settings = await getSettings();
  const total = videoIds.length;
  let done = 0;
  const errors = [];

  for (let i = 0; i < videoIds.length; i++) {
    if (batchCancel) break;
    const videoId = videoIds[i];
    onProgress({
      phase: 'batch',
      current: i + 1,
      total,
      videoId,
      status: 'fetching',
    });

    try {
      const videoMeta = await fetchVideoMetaOembed(videoId);
      const segments = await fetchTranscriptForVideo(videoId, settings.language);
      onProgress({ phase: 'batch', current: i + 1, total, videoId, title: videoMeta.title, status: 'generating' });

      let notesMarkdown;
      if (settings.provider === 'ollama') {
        notesMarkdown = await generateOllamaNotes(mode, videoMeta, segments, settings);
      } else {
        const chunks = chunkTranscript(segments);
        const config = {
          provider: settings.provider,
          apiKey:
            settings.provider === 'gemini'
              ? settings.geminiApiKey?.trim()
              : settings.openaiApiKey?.trim(),
          model:
            settings.provider === 'gemini'
              ? settings.geminiModel
              : settings.openaiModel,
        };
        notesMarkdown = await generateStudyNotes(mode, videoMeta, chunks, config);
      }

      await saveNoteToLibrary(
        {
          ...videoMeta,
          mode,
          notesMarkdown,
          segments,
          tags: ['batch'],
        },
        { archivePrevious: true }
      );
      done++;
      onProgress({ phase: 'batch', current: i + 1, total, videoId, title: videoMeta.title, status: 'saved' });
    } catch (e) {
      errors.push({ videoId, error: e.message || String(e) });
      onProgress({ phase: 'batch', current: i + 1, total, videoId, status: 'error', error: e.message });
    }
  }

  return { ok: true, done, total, cancelled: batchCancel, errors };
}

function extractPlayerResponse(html) {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
