(function () {
  const PANEL_ID = 'ysn-panel';
  let state = {
    videoId: null,
    videoMeta: null,
    segments: [],
    trackKind: null,
    notesMarkdown: '',
    generating: false,
  };

  init();

  function init() {
    if (document.getElementById('ysn-root')) return;
    injectUi();
    observeNavigation();
    refreshVideo();
  }

  function injectUi() {
    const root = document.createElement('div');
    root.id = 'ysn-root';
    root.innerHTML = `
      <button type="button" id="ysn-toggle" title="YouTube Study Notes">📓 Study Notes</button>
      <aside id="${PANEL_ID}" aria-label="Study notes panel">
        <div id="ysn-panel-header">
          <h2>Study Notes</h2>
          <button type="button" id="ysn-close" aria-label="Close">×</button>
        </div>
        <div id="ysn-body">
          <div id="ysn-status"></div>
          <div id="ysn-meta"></div>
          <div class="ysn-field">
            <label for="ysn-mode">Note style</label>
            <select id="ysn-mode">
              <option value="detailed">Detailed study notes</option>
              <option value="quick">Quick summary</option>
              <option value="cornell">Cornell notes</option>
              <option value="exam">Exam cram</option>
            </select>
          </div>
          <div class="ysn-actions">
            <button type="button" class="ysn-btn ysn-btn-primary" id="ysn-generate">Generate notes</button>
            <button type="button" class="ysn-btn ysn-btn-secondary" id="ysn-load-transcript">Load transcript</button>
          </div>
          <div id="ysn-transcript-stats"></div>
          <div class="ysn-actions" id="ysn-export-actions" style="display:none">
            <button type="button" class="ysn-btn ysn-btn-secondary" id="ysn-export-md">Export Markdown</button>
            <button type="button" class="ysn-btn ysn-btn-secondary" id="ysn-export-pdf">Export PDF</button>
          </div>
          <div class="ysn-field">
            <label for="ysn-editor">Notes (editable)</label>
            <textarea id="ysn-editor" placeholder="Generate notes or paste your own…"></textarea>
          </div>
          <label>Preview</label>
          <div id="ysn-preview"><p class="ysn-empty">Notes preview appears here.</p></div>
        </div>
      </aside>
    `;
    document.body.appendChild(root);

    document.getElementById('ysn-toggle').addEventListener('click', () => togglePanel(true));
    document.getElementById('ysn-close').addEventListener('click', () => togglePanel(false));
    document.getElementById('ysn-generate').addEventListener('click', onGenerate);
    document.getElementById('ysn-load-transcript').addEventListener('click', onLoadTranscript);
    document.getElementById('ysn-export-md').addEventListener('click', onExportMarkdown);
    document.getElementById('ysn-export-pdf').addEventListener('click', onExportPdf);
    document.getElementById('ysn-editor').addEventListener('input', onEditorInput);

    chrome.storage.sync.get(['noteMode'], (data) => {
      if (data.noteMode) document.getElementById('ysn-mode').value = data.noteMode;
    });
  }

  function togglePanel(open) {
    const panel = document.getElementById(PANEL_ID);
    if (open === undefined) panel.classList.toggle('ysn-open');
    else panel.classList.toggle('ysn-open', open);
  }

  function observeNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        refreshVideo();
      }
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('yt-navigate-finish', refreshVideo);
    setInterval(check, 1500);
  }

  async function refreshVideo() {
    const videoId = getVideoId();
    if (!videoId || videoId === state.videoId) return;

    state = {
      videoId,
      videoMeta: extractVideoMeta(videoId),
      segments: [],
      trackKind: null,
      notesMarkdown: '',
      generating: false,
    };

    renderMeta();
    setStatus('');
    document.getElementById('ysn-editor').value = '';
    document.getElementById('ysn-preview').innerHTML =
      '<p class="ysn-empty">Notes preview appears here.</p>';
    document.getElementById('ysn-transcript-stats').textContent = '';
    document.getElementById('ysn-export-actions').style.display = 'none';

    const saved = await sendMessage({ type: 'GET_LIBRARY' }).catch(() => null);
    if (saved?.ok) {
      const note = saved.library?.find((n) => n.videoId === videoId);
      if (note?.notesMarkdown) {
        state.notesMarkdown = note.notesMarkdown;
        state.segments = note.segments || [];
        document.getElementById('ysn-editor').value = note.notesMarkdown;
        updatePreview(note.notesMarkdown);
        document.getElementById('ysn-export-actions').style.display = 'flex';
        if (state.segments.length) {
          document.getElementById('ysn-transcript-stats').textContent =
            formatStats(state.segments);
        }
      }
    }
  }

  function getVideoId() {
    const u = new URL(location.href);
    return u.searchParams.get('v');
  }

  function extractVideoMeta(videoId) {
    const pr = getPlayerResponse();
    const micro = pr?.videoDetails || pr?.microformat?.playerMicroformatRenderer;
    const title =
      micro?.title ||
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title')?.textContent?.trim() ||
      'Untitled video';
    const channel =
      micro?.author ||
      document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() ||
      'Unknown channel';
    const thumb =
      micro?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const chapters = getChaptersFromPlayer(pr);

    return { videoId, title, channel, thumbnail: thumb, chapters };
  }

  function getPlayerResponse() {
    const yt = window.ytInitialPlayerResponse;
    if (yt) return yt;
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const t = s.textContent || '';
      const m = t.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (m) {
        try {
          return JSON.parse(m[1]);
        } catch {
          /* continue */
        }
      }
    }
    return null;
  }

  function getChaptersFromPlayer(pr) {
    if (!pr) return [];
    const markers =
      pr?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
        ?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer
        ?.markersMap?.[0]?.value?.chapters;
    if (!markers) return [];
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

  function renderMeta() {
    const el = document.getElementById('ysn-meta');
    if (!state.videoMeta) {
      el.innerHTML = '<p class="ysn-empty">Open a YouTube video to get started.</p>';
      return;
    }
    const { title, channel } = state.videoMeta;
    el.innerHTML = `
      <p class="ysn-title">${escapeHtml(title)}</p>
      <p class="ysn-channel">${escapeHtml(channel)}</p>
    `;
  }

  async function onLoadTranscript() {
    setStatus('Loading transcript…', 'info');
    try {
      const { segments, trackKind } = await loadTranscriptFromPage();
      state.segments = segments;
      state.trackKind = trackKind;
      document.getElementById('ysn-transcript-stats').textContent = formatStats(segments);
      const badge = trackKind === 'asr' ? 'auto captions' : 'manual captions';
      setStatus(`Transcript loaded (${badge}).`, 'success');
    } catch (e) {
      setStatus(e.message, 'error');
    }
  }

  async function loadTranscriptFromPage() {
    const pr = getPlayerResponse();
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) {
      throw new Error(
        'No captions found. Enable captions on this video (CC button) and try again.'
      );
    }

    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    const lang = settings?.settings?.language || 'en';
    const track = selectTrack(tracks, lang);
    if (!track?.baseUrl) throw new Error('Could not resolve caption track URL.');

    const res = await sendMessage({ type: 'FETCH_TRANSCRIPT', trackUrl: track.baseUrl });
    if (!res?.ok) throw new Error(res?.error || 'Transcript fetch failed.');
    return { segments: res.segments, trackKind: track.kind || 'manual' };
  }

  function selectTrack(tracks, langPref) {
    const lang = langPref.toLowerCase().split('-')[0];
    const matchLang = (t) => (t.languageCode || '').toLowerCase().startsWith(lang);
    const manual = tracks.filter((t) => t.kind !== 'asr' && matchLang(t));
    if (manual.length) return manual[0];
    const auto = tracks.filter((t) => t.kind === 'asr' && matchLang(t));
    if (auto.length) return auto[0];
    return tracks.find((t) => t.kind !== 'asr') || tracks[0];
  }

  async function onGenerate() {
    if (state.generating) return;
    const mode = document.getElementById('ysn-mode').value;
    chrome.storage.sync.set({ noteMode: mode });

    setStatus('Preparing…', 'info');
    state.generating = true;
    setButtonsDisabled(true);

    try {
      if (!state.segments.length) {
        setStatus('Loading transcript first…', 'info');
        const t = await loadTranscriptFromPage();
        state.segments = t.segments;
        state.trackKind = t.trackKind;
        document.getElementById('ysn-transcript-stats').textContent = formatStats(
          state.segments
        );
      }

      setStatus('Generating study notes with AI… This may take a minute.', 'info');

      const res = await sendMessage({
        type: 'GENERATE_NOTES',
        videoMeta: state.videoMeta,
        segments: state.segments,
        mode,
      });

      if (!res?.ok) throw new Error(res?.error || 'Generation failed.');

      state.notesMarkdown = res.notesMarkdown;
      document.getElementById('ysn-editor').value = res.notesMarkdown;
      updatePreview(res.notesMarkdown);
      document.getElementById('ysn-export-actions').style.display = 'flex';
      setStatus('Notes generated and saved to your library.', 'success');
    } catch (e) {
      setStatus(e.message, 'error');
    } finally {
      state.generating = false;
      setButtonsDisabled(false);
    }
  }

  async function onExportMarkdown() {
    const notesMarkdown = document.getElementById('ysn-editor').value.trim();
    if (!notesMarkdown) {
      setStatus('Nothing to export. Generate or write notes first.', 'error');
      return;
    }

    const mode = document.getElementById('ysn-mode').value;
    const res = await sendMessage({
      type: 'BUILD_MARKDOWN',
      payload: {
        ...state.videoMeta,
        notesMarkdown,
        mode,
        segments: state.segments,
      },
    });

    if (!res?.ok) {
      setStatus(res?.error || 'Export failed.', 'error');
      return;
    }

    const safeName = sanitizeFilename(state.videoMeta?.title || 'notes');
    await sendMessage({
      type: 'DOWNLOAD_FILE',
      filename: `${safeName}-study-notes.md`,
      content: res.markdown,
      mimeType: 'text/markdown',
    });
    setStatus('Markdown download started.', 'success');
  }

  async function onExportPdf() {
    const notesMarkdown = document.getElementById('ysn-editor').value.trim();
    if (!notesMarkdown) {
      setStatus('Nothing to export. Generate or write notes first.', 'error');
      return;
    }

    const payload = {
      title: state.videoMeta?.title,
      channel: state.videoMeta?.channel,
      videoId: state.videoMeta?.videoId,
      notesHtml: markdownToHtml(notesMarkdown),
      mode: document.getElementById('ysn-mode').value,
    };

    await chrome.storage.local.set({ ysn_pdf_export: payload });
    const url = chrome.runtime.getURL('export/export.html');
    window.open(url, '_blank');
    setStatus('PDF export opened — use Print → Save as PDF.', 'success');
  }

  function onEditorInput() {
    const md = document.getElementById('ysn-editor').value;
    state.notesMarkdown = md;
    updatePreview(md);
    if (md.trim()) document.getElementById('ysn-export-actions').style.display = 'flex';
  }

  function updatePreview(md) {
    const el = document.getElementById('ysn-preview');
    if (!md.trim()) {
      el.innerHTML = '<p class="ysn-empty">Notes preview appears here.</p>';
      return;
    }
    el.innerHTML = markdownToHtml(md);
    linkifyTimestamps(el, state.videoMeta?.videoId);
  }

  function linkifyTimestamps(container, videoId) {
    if (!videoId) return;
    const base = `https://www.youtube.com/watch?v=${videoId}`;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    for (const node of nodes) {
      if (!re.test(node.textContent)) continue;
      re.lastIndex = 0;
      const span = document.createElement('span');
      let last = 0;
      let m;
      const text = node.textContent;
      while ((m = re.exec(text)) !== null) {
        span.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.href = `${base}&t=${parseTimestamp(m[1])}s`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = m[0];
        span.appendChild(a);
        last = m.index + m[0].length;
      }
      span.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(span, node);
    }
  }

  function parseTimestamp(ts) {
    const p = ts.split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return p[0] * 60 + p[1];
  }

  function markdownToHtml(md) {
    let html = escapeHtml(md);
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?)(?=\n\n|$)/g, (m) => {
      if (m.includes('<li>')) return '<ul>' + m + '</ul>';
      return m;
    });
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[23]>)/g, '$1');
    html = html.replace(/(<\/h[23]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    return html;
  }

  function formatStats(segments) {
    const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    const dur = segments.length
      ? Math.floor(segments[segments.length - 1].start)
      : 0;
    const mins = Math.floor(dur / 60);
    return `${segments.length} lines · ~${words.toLocaleString()} words · ~${mins} min covered`;
  }

  function setStatus(msg, type) {
    const el = document.getElementById('ysn-status');
    if (!msg) {
      el.className = '';
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.className = `ysn-visible ysn-${type || 'info'}`;
  }

  function setButtonsDisabled(disabled) {
    document.getElementById('ysn-generate').disabled = disabled;
    document.getElementById('ysn-load-transcript').disabled = disabled;
  }

  function sendMessage(msg) {
    return chrome.runtime.sendMessage(msg);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'YSN_OPEN_PANEL') togglePanel(true);
  });
})();
