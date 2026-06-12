/**
 * Fetch YouTube transcripts — hooks network, DOM, InnerTube, live captions.
 */
(function () {
  window.__YSN_CAPTURED = { transcript: null, timedtext: null };

  function installNetworkHook() {
    if (window.__YSN_HOOKED) return;
    window.__YSN_HOOKED = true;

    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const url = String(args[0]?.url || args[0] || '');
        if (url.includes('get_transcript') || url.includes('/timedtext')) {
          const clone = res.clone();
          const body = await clone.text();
          if (url.includes('get_transcript')) {
            window.__YSN_CAPTURED.transcript = JSON.parse(body);
          } else {
            window.__YSN_CAPTURED.timedtext = body;
          }
        }
      } catch {
        /* ignore parse errors */
      }
      return res;
    };
  }

  installNetworkHook();

  function decodeXmlEntities(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  function parseTimedTextXml(xml) {
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

  function parseJson3(jsonText) {
    const data = JSON.parse(jsonText);
    const segments = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue;
      const t = (ev.tStartMs || 0) / 1000;
      const line = ev.segs
        .map((s) => s.utf8 || '')
        .join('')
        .replace(/\n/g, ' ')
        .trim();
      if (line) segments.push({ text: line, start: t, duration: (ev.dDurationMs || 0) / 1000 });
    }
    return segments;
  }

  function parseVtt(vtt) {
    const segments = [];
    const blocks = vtt.replace(/\r/g, '').split('\n\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const start = parseVttTime(timeLine.split('-->')[0].trim());
      const text = lines
        .filter((l) => !l.includes('-->') && !/^\d+$/.test(l.trim()))
        .join(' ')
        .trim();
      if (text) segments.push({ text, start, duration: 0 });
    }
    return segments;
  }

  function parseVttTime(t) {
    const p = t.split(':').map(parseFloat);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return parseFloat(t) || 0;
  }

  function dedupeSegments(segments) {
    const out = [];
    for (const seg of segments) {
      const prev = out[out.length - 1];
      if (prev && prev.text === seg.text) continue;
      out.push(seg);
    }
    return out;
  }

  function parseCaptionBody(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 2) return [];
    if (trimmed.startsWith('{')) {
      try {
        return parseJson3(trimmed);
      } catch {
        return [];
      }
    }
    if (trimmed.startsWith('WEBVTT') || trimmed.includes('-->')) return parseVtt(trimmed);
    return parseTimedTextXml(trimmed);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function parseJsonArrayFromHtml(html, key) {
    const marker = `"${key}"`;
    const idx = html.indexOf(marker);
    if (idx === -1) return null;
    const arrStart = html.indexOf('[', idx);
    if (arrStart === -1) return null;
    let depth = 0;
    for (let i = arrStart; i < html.length; i++) {
      if (html[i] === '[') depth++;
      else if (html[i] === ']') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(arrStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  async function sha1Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-1', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function buildSapisidAuth() {
    const match = document.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/);
    const sapisid = match?.[1];
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const origin = 'https://www.youtube.com';
    const hash = await sha1Hex(`${ts} ${origin} ${sapisid}`);
    return `SAPISIDHASH ${ts}_${hash}`;
  }

  function getInnertubeContext() {
    const cfg = window.ytcfg?.data_ || {};
    return {
      apiKey: cfg.INNERTUBE_API_KEY || '',
      clientVersion: cfg.INNERTUBE_CLIENT_VERSION || '2.20250220.01.00',
      hl: cfg.HL || 'en',
      gl: cfg.GL || 'US',
    };
  }

  function extractCaptionTracks() {
    const html = document.documentElement.innerHTML;
    let tracks = parseJsonArrayFromHtml(html, 'captionTracks');
    if (tracks?.length) return tracks;

    for (const script of document.querySelectorAll('script')) {
      const text = script.textContent || '';
      if (!text.includes('captionTracks')) continue;
      tracks = parseJsonArrayFromHtml(text, 'captionTracks');
      if (tracks?.length) return tracks;
    }
    return [];
  }

  function extractTranscriptParams() {
    const html = document.documentElement.innerHTML;
    const m = html.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    return (
      findTranscriptParams(window.ytInitialData) ||
      findTranscriptParams(window.ytInitialPlayerResponse)
    );
  }

  function findTranscriptParams(obj, depth = 0) {
    if (!obj || depth > 18) return null;
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      if (obj.getTranscriptEndpoint?.params) return obj.getTranscriptEndpoint.params;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const r = findTranscriptParams(item, depth + 1);
        if (r) return r;
      }
    } else if (typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const r = findTranscriptParams(obj[k], depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  function parseGetTranscriptResponse(data) {
    const segments = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.transcriptSegmentRenderer) {
        const r = node.transcriptSegmentRenderer;
        const text = (r.snippet?.runs || [])
          .map((x) => x.text || '')
          .join('')
          .trim();
        const startMs = parseInt(r.startMs || r.startTimeMs || '0', 10);
        if (text) segments.push({ text, start: startMs / 1000, duration: 0 });
      }
      if (Array.isArray(node)) node.forEach(walk);
      else Object.values(node).forEach(walk);
    };
    walk(data);
    return segments;
  }

  function queryAllDeep(selector, root = document) {
    const results = [];
    const scan = (node) => {
      results.push(...node.querySelectorAll(selector));
      node.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    };
    scan(root);
    return results;
  }

  function buildCaptionUrls(trackUrl, videoId, lang) {
    const urls = [];
    const add = (u) => {
      if (u && !urls.includes(u)) urls.push(u);
    };

    if (trackUrl) {
      const base = trackUrl.startsWith('http')
        ? trackUrl
        : `https://www.youtube.com${trackUrl.startsWith('/') ? '' : '/'}${trackUrl}`;
      try {
        const u = new URL(base);
        for (const fmt of ['json3', 'srv3', 'vtt']) {
          const copy = new URL(u);
          copy.searchParams.set('fmt', fmt);
          add(copy.toString());
        }
        add(u.toString());
      } catch {
        add(base);
      }
    }

    if (videoId) {
      for (const l of [...new Set([lang, 'en', 'a.en'].filter(Boolean))]) {
        add(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(l)}&fmt=json3`);
        add(
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(l)}&kind=asr&fmt=json3`
        );
      }
    }
    return urls;
  }

  async function fetchCaptionText(url, videoId) {
    const auth = await buildSapisidAuth();
    const headers = { Referer: `https://www.youtube.com/watch?v=${videoId}` };
    if (auth) {
      headers.Authorization = auth;
      headers['X-Origin'] = 'https://www.youtube.com';
    }
    const res = await fetch(url, { credentials: 'include', headers });
    if (!res.ok) return '';
    return res.text();
  }

  async function fetchViaInnertubeGetTranscript(videoId) {
    const params = extractTranscriptParams();
    if (!params) return [];

    const ctx = getInnertubeContext();
    if (!ctx.apiKey) return [];

    const auth = await buildSapisidAuth();
    const url = `https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(ctx.apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth, 'X-Origin': 'https://www.youtube.com' } : {}),
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: ctx.clientVersion,
            hl: ctx.hl,
            gl: ctx.gl,
          },
        },
        params,
        externalVideoId: videoId,
      }),
    });

    if (!res.ok) return [];
    return parseGetTranscriptResponse(await res.json());
  }

  function clickByText(patterns) {
    const all = queryAllDeep('button, a, yt-formatted-string, ytd-menu-service-item-renderer, tp-yt-paper-item');
    for (const el of all) {
      const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
      if (patterns.some((p) => p.test(text))) {
        el.click();
        return true;
      }
    }
    return false;
  }

  async function expandDescription() {
    const expanders = ['#expand', 'tp-yt-paper-button#expand', 'ytd-text-inline-expander #expand'];
    for (const sel of expanders) {
      const el = document.querySelector(sel);
      if (el) {
        el.click();
        await sleep(300);
        return;
      }
    }
    clickByText([/show more/i, /^more$/i]);
    await sleep(300);
  }

  async function openViaOverflowMenu() {
    const moreBtn = queryAllDeep(
      'button[aria-label="More actions"], button[aria-label="More"], ytd-menu-renderer button'
    ).find((b) => /more actions/i.test(b.getAttribute('aria-label') || ''));

    if (moreBtn) {
      moreBtn.click();
      await sleep(500);
      if (clickByText([/show transcript/i, /open transcript/i, /^transcript$/i])) {
        await sleep(900);
        return true;
      }
    }
    return false;
  }

  async function openTranscriptPanel() {
    await expandDescription();

    if (
      clickByText([/show transcript/i, /open transcript/i]) ||
      openViaOverflowMenu()
    ) {
      await sleep(900);
      return true;
    }

    const selectors = [
      'button[aria-label="Show transcript"]',
      'button[aria-label="Open transcript"]',
      'ytd-video-description-transcript-section-renderer button',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        await sleep(900);
        return true;
      }
    }
    return false;
  }

  function clearCapture() {
    window.__YSN_CAPTURED = { transcript: null, timedtext: null };
  }

  async function tryHookedCapture() {
    clearCapture();
    await openTranscriptPanel();
    await openViaOverflowMenu();

    for (let i = 0; i < 30; i++) {
      if (window.__YSN_CAPTURED?.transcript) {
        const segs = parseGetTranscriptResponse(window.__YSN_CAPTURED.transcript);
        if (segs.length) return segs;
      }
      if (window.__YSN_CAPTURED?.timedtext) {
        const segs = dedupeSegments(parseCaptionBody(window.__YSN_CAPTURED.timedtext));
        if (segs.length) return segs;
      }
      const dom = collectDomSegments();
      if (dom.length) return dom;
      await sleep(250);
    }
    return [];
  }

  function collectDomSegments() {
    const segments = [];
    const nodes = queryAllDeep(
      'ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer, #segments-container ytd-transcript-segment-renderer'
    );

    for (const node of nodes) {
      let text = '';
      let start = 0;
      const textEl =
        node.querySelector('.segment-text') ||
        node.querySelector('yt-formatted-string.segment-text') ||
        node.querySelector('yt-formatted-string');
      text = (textEl?.textContent || '').trim();
      const timeEl = node.querySelector('.segment-timestamp, .segment-start-offset');
      if (timeEl) start = parsePanelTime(timeEl.textContent);
      if (text && !/^\d{1,2}:\d{2}/.test(text)) {
        segments.push({ text, start, duration: 0 });
      }
    }
    return segments;
  }

  function parsePanelTime(t) {
    const s = (t || '').trim().replace(/[^\d:.]/g, '');
    const p = s.split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return parseFloat(s) || 0;
  }

  async function fetchFromCaptionTracks(videoId, lang) {
    const tracks = extractCaptionTracks();
    if (!tracks.length) return [];

    const langCode = (lang || 'en').split('-')[0].toLowerCase();
    const pick =
      tracks.find((t) => t.kind !== 'asr' && (t.languageCode || '').startsWith(langCode)) ||
      tracks.find((t) => t.kind === 'asr' && (t.languageCode || '').startsWith(langCode)) ||
      tracks[0];

    const trackUrl = pick?.baseUrl || pick?.url;
    if (!trackUrl) return [];

    for (const url of buildCaptionUrls(trackUrl, videoId, pick.languageCode || lang)) {
      try {
        const text = await fetchCaptionText(url, videoId);
        const segments = dedupeSegments(parseCaptionBody(text));
        if (segments.length) return segments;
      } catch {
        /* next */
      }
    }
    return [];
  }

  /** Capture on-screen player captions while video plays (live CC only). */
  window.YSN_captureLiveCaptions = async function (seconds = 50, onProgress) {
    const video = document.querySelector('video.html5-main-video, video');
    if (!video) throw new Error('Start playing the video first, then try again.');

    if (video.paused) {
      try {
        await video.play();
      } catch {
        throw new Error('Click play on the video, then click Capture live captions.');
      }
    }

    const segments = [];
    const seen = new Map();
    const end = Date.now() + seconds * 1000;

    while (Date.now() < end) {
      const t = video.currentTime;
      queryAllDeep('.ytp-caption-segment, .captions-text span').forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 1) {
          seen.set(text, t);
        }
      });
      if (onProgress) onProgress(Math.round((1 - (end - Date.now()) / (seconds * 1000)) * 100));
      await sleep(400);
    }

    for (const [text, start] of seen.entries()) {
      segments.push({ text, start, duration: 0 });
    }
    segments.sort((a, b) => a.start - b.start);
    if (segments.length < 3) {
      throw new Error('Captured too little text. Ensure CC is on and the video is playing.');
    }
    return dedupeSegments(segments);
  };

  window.YSN_fetchTranscript = async function (trackUrl, videoId, lang) {
    const methods = [
      () => tryHookedCapture(),
      () => fetchFromCaptionTracks(videoId, lang),
      async () => {
        if (!trackUrl) return [];
        for (const url of buildCaptionUrls(trackUrl, videoId, lang)) {
          const text = await fetchCaptionText(url, videoId);
          const segments = dedupeSegments(parseCaptionBody(text));
          if (segments.length) return segments;
        }
        return [];
      },
      () => fetchViaInnertubeGetTranscript(videoId),
      async () => {
        await openTranscriptPanel();
        for (let i = 0; i < 24; i++) {
          const segs = collectDomSegments();
          if (segs.length) return segs;
          await sleep(250);
        }
        return [];
      },
    ];

    for (const method of methods) {
      try {
        const segments = dedupeSegments(await method());
        if (segments.length) return segments;
      } catch {
        /* next */
      }
    }

    throw new Error(
      'No transcript track found. Either open Show transcript on YouTube first, or use Capture live captions (CC on, video playing).'
    );
  };
})();
