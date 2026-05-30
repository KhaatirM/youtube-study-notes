/**
 * Parse YouTube timedtext XML (works in service worker — no DOMParser).
 * @param {string} xml
 * @returns {{ text: string; start: number; duration: number }[]}
 */
export function parseTimedTextXml(xml) {
  const segments = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const start = parseFloat(/start="([^"]+)"/.exec(attrs)?.[1] || '0');
    const dur = parseFloat(/dur="([^"]+)"/.exec(attrs)?.[1] || '0');
    const text = decodeXmlEntities(m[2])
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) segments.push({ text, start, duration: dur });
  }
  return segments;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Merge duplicate consecutive lines (auto-captions often repeat).
 * @param {{ text: string; start: number; duration: number }[]} segments
 */
export function dedupeSegments(segments) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.text === seg.text) continue;
    out.push(seg);
  }
  return out;
}

/**
 * Extract caption track list from page player response.
 * @param {object} playerResponse
 */
export function getCaptionTracks(playerResponse) {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks : [];
}

/**
 * Pick best track: manual in preferred lang, else auto, else first.
 * @param {object[]} tracks
 * @param {string} [langPref='en']
 */
export function selectCaptionTrack(tracks, langPref = 'en') {
  if (!tracks.length) return null;

  const lang = langPref.toLowerCase().split('-')[0];
  const matchLang = (t) =>
    (t.languageCode || '').toLowerCase().startsWith(lang);

  const manual = tracks.filter((t) => t.kind !== 'asr' && matchLang(t));
  if (manual.length) return manual[0];

  const auto = tracks.filter((t) => t.kind === 'asr' && matchLang(t));
  if (auto.length) return auto[0];

  const anyManual = tracks.filter((t) => t.kind !== 'asr');
  if (anyManual.length) return anyManual[0];

  return tracks[0];
}

/**
 * @param {object} playerResponse
 */
export function getVideoChapters(playerResponse) {
  const markers =
    playerResponse?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
      ?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer
      ?.markersMap?.[0]?.value?.chapters;

  if (!markers?.length) {
    const descChapters = playerResponse?.microformat?.playerMicroformatRenderer?.chapters;
    if (Array.isArray(descChapters)) {
      return descChapters.map((c) => ({
        title: c.title,
        start: parseChapterTime(c.startTime),
      }));
    }
    return [];
  }

  return markers
    .map((m) => {
      const ch = m.chapterRenderer;
      if (!ch) return null;
      return {
        title: ch.title?.simpleText || 'Chapter',
        start: parseInt(ch.timeRangeStartMillis || '0', 10) / 1000,
      };
    })
    .filter(Boolean);
}

function parseChapterTime(t) {
  if (typeof t === 'number') return t;
  if (!t) return 0;
  const parts = String(t).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(t) || 0;
}
