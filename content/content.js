(function () {
  const PANEL_ID = 'ysn-panel';
  let state = {
    videoId: null,
    videoMeta: null,
    segments: [],
    trackKind: null,
    notesMarkdown: '',
    generating: false,
    autosaveTimer: null,
    libraryCache: [],
  };

  init();

  function isWatchPage() {
    return Boolean(getVideoId());
  }

  function init() {
    if (!isWatchPage()) return;
    if (!document.getElementById('ysn-root')) {
      injectUi();
      observeNavigation();
    }
    refreshVideo();
  }

  function ensureUi() {
    if (!isWatchPage()) return false;
    if (!document.getElementById('ysn-root')) {
      injectUi();
      observeNavigation();
    }
    refreshVideo();
    if (!isExtensionValid()) showRefreshRequired();
    return true;
  }

  function injectUi() {
    const root = document.createElement('div');
    root.id = 'ysn-root';
    root.innerHTML = `
      <button type="button" id="ysn-toggle" title="Open Study Notes (Alt+S)">
        <span class="ysn-toggle-icon" aria-hidden="true"></span>
        <span class="ysn-toggle-label">Study Notes</span>
      </button>
      <aside id="${PANEL_ID}" aria-label="Study notes panel">
        <div id="ysn-panel-header">
          <div class="ysn-brand">
            <span class="ysn-brand-mark" aria-hidden="true"></span>
            <h2>Study Notes</h2>
          </div>
          <div class="ysn-header-actions">
            <label class="ysn-pin-label" title="Keep panel open on this tab">
              <input type="checkbox" id="ysn-pin-panel" />
              <span>Pin</span>
            </label>
            <button type="button" id="ysn-history-link" class="ysn-text-link">History</button>
            <button type="button" id="ysn-close" class="ysn-icon-btn" aria-label="Close panel">×</button>
          </div>
        </div>
        <div id="ysn-progress-wrap" class="ysn-progress-wrap" hidden>
          <div class="ysn-progress-track"><div id="ysn-progress-fill" class="ysn-progress-fill"></div></div>
          <span id="ysn-progress-label" class="ysn-progress-label"></span>
        </div>
        <div id="ysn-history-view" class="ysn-history-view" hidden>
          <div class="ysn-history-head">
            <h3 class="ysn-section-title">Your library</h3>
            <p class="ysn-history-intro">Search, open, or remove saved notes from this device.</p>
          </div>
          <input type="search" id="ysn-history-search" class="ysn-history-search" placeholder="Search videos…" />
          <div class="ysn-history-toolbar">
            <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-small" id="ysn-backup-export">Backup</button>
            <label class="ysn-btn ysn-btn-ghost ysn-btn-small ysn-import-label">
              Restore
              <input type="file" id="ysn-backup-import" accept=".json,application/json" hidden />
            </label>
          </div>
          <ul id="ysn-history-list" class="ysn-history-list"></ul>
          <p id="ysn-history-empty" class="ysn-empty-state">No saved notes yet.</p>
        </div>
        <div id="ysn-body">
          <div id="ysn-ollama-status" class="ysn-ollama-status" hidden></div>
          <div id="ysn-status"></div>
          <div id="ysn-meta"></div>
          <div class="ysn-card ysn-card-tools">
            <label class="ysn-section-label" for="ysn-mode">Note style</label>
            <select id="ysn-mode" class="ysn-select">
              <option value="detailed">Detailed study notes</option>
              <option value="quick">Quick summary</option>
              <option value="cornell">Cornell notes</option>
              <option value="exam">Exam cram</option>
              <option value="quiz">Flashcards &amp; quiz</option>
            </select>
            <div class="ysn-actions ysn-actions-row">
              <button type="button" class="ysn-btn ysn-btn-primary" id="ysn-generate" title="Generate study notes">Generate</button>
              <button type="button" class="ysn-btn ysn-btn-ghost" id="ysn-load-transcript" title="Load transcript">Transcript</button>
              <button type="button" class="ysn-btn ysn-btn-ghost" id="ysn-capture-live" title="Capture on-screen captions">Live CC</button>
            </div>
            <p id="ysn-transcript-stats" class="ysn-transcript-stats"></p>
            <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-small ysn-batch-btn" id="ysn-batch-playlist" hidden>Batch playlist (max 20)</button>
          </div>
          <div class="ysn-card ysn-card-export" id="ysn-export-actions" style="display:none">
            <span class="ysn-section-label">Export &amp; copy</span>
            <div class="ysn-actions ysn-export-grid">
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-compact" id="ysn-copy-md">Copy MD</button>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-compact" id="ysn-copy-text">Copy</button>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-compact" id="ysn-export-md">.md</button>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-compact" id="ysn-export-pdf">PDF</button>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-compact" id="ysn-export-anki">Anki CSV</button>
            </div>
          </div>
          <div id="ysn-versions" class="ysn-card ysn-card-versions" hidden>
            <label class="ysn-section-label" for="ysn-version-select">Previous versions</label>
            <div class="ysn-versions-row">
              <select id="ysn-version-select" class="ysn-select"></select>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-small" id="ysn-restore-version">Restore</button>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-small" id="ysn-compare-version">Compare</button>
            </div>
          </div>
          <div id="ysn-compare-view" class="ysn-card ysn-compare-view" hidden>
            <div class="ysn-compare-header">
              <span class="ysn-section-label">Compare with previous version</span>
              <button type="button" class="ysn-btn ysn-btn-ghost ysn-btn-small" id="ysn-compare-close">Close</button>
            </div>
            <div class="ysn-compare-grid">
              <div class="ysn-compare-col"><h4>Current</h4><pre id="ysn-compare-current"></pre></div>
              <div class="ysn-compare-col"><h4>Previous</h4><pre id="ysn-compare-old"></pre></div>
            </div>
          </div>
          <p id="ysn-autosave-hint" class="ysn-autosave-hint" hidden>Saved to library</p>
          <div class="ysn-card ysn-card-editor">
            <div class="ysn-editor-head">
              <label class="ysn-section-label" for="ysn-editor">Notes</label>
              <span id="ysn-reading-stats" class="ysn-reading-stats"></span>
            </div>
            <label class="ysn-section-label" for="ysn-tags-input">Tags</label>
            <input type="text" id="ysn-tags-input" class="ysn-tags-input" placeholder="exam, lecture (comma separated)" />
            <textarea id="ysn-editor" class="ysn-textarea" placeholder="Generate notes or write your own…"></textarea>
          </div>
          <div class="ysn-card ysn-card-preview">
            <span class="ysn-section-label">Preview</span>
            <div id="ysn-preview"><p class="ysn-empty">Your formatted notes appear here.</p></div>
          </div>
        </div>
      </aside>
      <div id="ysn-modals"></div>
    `;
    document.body.appendChild(root);

    document.getElementById('ysn-toggle').addEventListener('click', () => openPanel());
    document.getElementById('ysn-preview').addEventListener('click', onPreviewClick);
    document.getElementById('ysn-close').addEventListener('click', () => {
      closeHistoryView();
      togglePanel(false);
      try {
        sessionStorage.removeItem('ysn_panel_open');
      } catch {
        /* ignore */
      }
    });
    document.getElementById('ysn-history-link').addEventListener('click', onToggleHistory);
    document.getElementById('ysn-generate').addEventListener('click', onGenerate);
    document.getElementById('ysn-load-transcript').addEventListener('click', onLoadTranscript);
    document.getElementById('ysn-capture-live').addEventListener('click', onCaptureLive);
    document.getElementById('ysn-export-md').addEventListener('click', onExportMarkdown);
    document.getElementById('ysn-export-pdf').addEventListener('click', onExportPdf);
    document.getElementById('ysn-copy-md').addEventListener('click', () => onCopyNotes(false));
    document.getElementById('ysn-copy-text').addEventListener('click', () => onCopyNotes(true));
    document.getElementById('ysn-restore-version').addEventListener('click', onRestoreVersion);
    document.getElementById('ysn-history-search').addEventListener('input', () => renderHistoryList());
    document.getElementById('ysn-backup-export').addEventListener('click', onBackupExport);
    document.getElementById('ysn-backup-import').addEventListener('change', onBackupImport);
    document.getElementById('ysn-editor').addEventListener('input', onEditorInput);

    chrome.storage.sync.get(['noteMode', 'pinPanel', 'theme'], (data) => {
      if (data.noteMode) document.getElementById('ysn-mode').value = data.noteMode;
      const pin = document.getElementById('ysn-pin-panel');
      if (pin) pin.checked = Boolean(data.pinPanel);
    });
    if (window.YSN_bootFeatures) window.YSN_bootFeatures();
  }

  const MODE_LABELS = {
    quick: 'Quick summary',
    detailed: 'Detailed',
    cornell: 'Cornell',
    exam: 'Exam cram',
    quiz: 'Flashcards & quiz',
  };

  function togglePanel(open) {
    const panel = document.getElementById(PANEL_ID);
    if (open === undefined) panel.classList.toggle('ysn-open');
    else panel.classList.toggle('ysn-open', open);
  }

  function openPanel() {
    togglePanel(true);
    refreshOllamaStatus();
    try {
      sessionStorage.setItem('ysn_panel_open', '1');
    } catch {
      /* ignore */
    }
  }

  async function refreshOllamaStatus() {
    const el = document.getElementById('ysn-ollama-status');
    if (!el || !isExtensionValid()) return;
    try {
      const settingsRes = await sendMessage({ type: 'GET_SETTINGS' });
      const settings = settingsRes?.settings || {};
      if ((settings.provider || 'ollama') !== 'ollama') {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.className = 'ysn-ollama-status ysn-ollama-checking';
      el.textContent = 'Checking Ollama…';
      const res = await sendMessage({ type: 'CHECK_OLLAMA', settings });
      el.className = 'ysn-ollama-status ' + (res?.online && res?.hasModel ? 'ysn-ollama-ok' : 'ysn-ollama-warn');
      el.textContent = res?.message || 'Ollama status unknown';
    } catch {
      el.hidden = true;
    }
  }

  function closeHistoryView() {
    const view = document.getElementById('ysn-history-view');
    const body = document.getElementById('ysn-body');
    const link = document.getElementById('ysn-history-link');
    if (!view) return;
    view.hidden = true;
    body.hidden = false;
    link.textContent = 'History';
    link.setAttribute('aria-expanded', 'false');
  }

  async function onToggleHistory() {
    const view = document.getElementById('ysn-history-view');
    const body = document.getElementById('ysn-body');
    const link = document.getElementById('ysn-history-link');
    const showing = !view.hidden;
    if (showing) {
      closeHistoryView();
      return;
    }
    view.hidden = false;
    body.hidden = true;
    link.textContent = 'Back';
    link.setAttribute('aria-expanded', 'true');
    await renderHistoryList();
  }

  async function renderHistoryList() {
    const list = document.getElementById('ysn-history-list');
    const empty = document.getElementById('ysn-history-empty');
    const q = (document.getElementById('ysn-history-search')?.value || '').trim().toLowerCase();
    list.innerHTML = '';
    const res = await sendMessage({ type: 'GET_LIBRARY' }).catch(() => null);
    state.libraryCache = res?.ok ? res.library || [] : [];
    let library = state.libraryCache;
    if (q) {
      library = library.filter((n) => {
        const hay =
          `${n.title || ''} ${n.channel || ''} ${(n.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q) || (n.tags || []).some((t) => t.includes(q.replace('#', '')));
      });
    }
    if (!library.length) {
      empty.style.display = 'block';
      empty.textContent = q ? 'No notes match your search.' : 'No saved notes yet.';
      return;
    }
    empty.style.display = 'none';
    for (const note of library) {
      const li = document.createElement('li');
      li.className = 'ysn-history-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ysn-history-item';
      if (note.videoId === state.videoId) btn.classList.add('ysn-history-item-current');
      const when = note.updatedAt
        ? new Date(note.updatedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : '';
      const modeLabel = MODE_LABELS[note.mode] || note.mode || 'Notes';
      const tagHtml = (note.tags || []).length
        ? `<span class="ysn-history-tags">${note.tags.map((t) => `<span class="ysn-tag-chip">#${escapeHtml(t)}</span>`).join('')}</span>`
        : '';
      btn.innerHTML =
        `<span class="ysn-history-title">${escapeHtml(note.title || 'Untitled')}</span>` +
        `<span class="ysn-history-channel">${escapeHtml(note.channel || '')}</span>` +
        `<span class="ysn-history-meta">${escapeHtml(modeLabel)}${when ? ' · ' + escapeHtml(when) : ''}</span>` +
        tagHtml;
      btn.addEventListener('click', () => openNoteFromHistory(note));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ysn-history-delete';
      del.title = 'Delete from library';
      del.setAttribute('aria-label', 'Delete');
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        onDeleteHistoryNote(note);
      });
      li.appendChild(btn);
      li.appendChild(del);
      list.appendChild(li);
    }
  }

  async function onDeleteHistoryNote(note) {
    if (!requireExtensionContext()) return;
    if (!confirm(`Delete saved notes for "${note.title || 'this video'}"?`)) return;
    await sendMessage({ type: 'DELETE_NOTE', videoId: note.videoId });
    if (note.videoId === state.videoId) {
      state.notesMarkdown = '';
      document.getElementById('ysn-editor').value = '';
      updatePreview('');
      document.getElementById('ysn-export-actions').style.display = 'none';
      document.getElementById('ysn-transcript-stats').textContent = '';
      document.getElementById('ysn-versions').hidden = true;
    }
    await renderHistoryList();
    setStatus('Note removed from library.', 'success');
  }

  async function onBackupExport() {
    if (!requireExtensionContext()) return;
    const res = await sendMessage({ type: 'EXPORT_LIBRARY' });
    if (!res?.ok || !res.backup) {
      setStatus('Could not export library.', 'error');
      return;
    }
    const json = JSON.stringify(res.backup, null, 2);
    await sendMessage({
      type: 'DOWNLOAD_FILE',
      filename: `youtube-study-notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
      content: json,
      mimeType: 'application/json',
    });
    setStatus('Library backup download started.', 'success');
  }

  async function onBackupImport(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !requireExtensionContext()) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const res = await sendMessage({ type: 'IMPORT_LIBRARY', backup });
      if (!res?.ok) throw new Error(res?.error || 'Import failed');
      await renderHistoryList();
      setStatus(`Imported ${res.imported || 0} note(s) into your library.`, 'success');
    } catch (e) {
      setStatus(e.message || 'Invalid backup file.', 'error');
    }
  }

  async function openNoteFromHistory(note) {
    if (!note?.videoId) return;
    closeHistoryView();
    if (note.videoId !== state.videoId) {
      setStatus('Opening video…', 'info');
      location.href = `https://www.youtube.com/watch?v=${note.videoId}`;
      return;
    }
    applySavedNote(note);
    setStatus('Loaded saved notes for this video.', 'success');
  }

  function applySavedNote(note) {
    state.notesMarkdown = note.notesMarkdown || '';
    state.segments = note.segments || [];
    if (note.mode) document.getElementById('ysn-mode').value = note.mode;
    const tagsEl = document.getElementById('ysn-tags-input');
    if (tagsEl) tagsEl.value = (note.tags || []).join(', ');
    document.getElementById('ysn-editor').value = note.notesMarkdown || '';
    updatePreview(note.notesMarkdown || '');
    document.getElementById('ysn-export-actions').style.display = note.notesMarkdown
      ? 'block'
      : 'none';
    document.getElementById('ysn-transcript-stats').textContent = state.segments.length
      ? formatStats(state.segments)
      : '';
    loadVersionPicker();
    if (window.YSN_updateReadingStats) window.YSN_updateReadingStats(note.notesMarkdown || '');
    updateBatchButtonVisibility();
  }

  function getTagsFromInput() {
    const raw = document.getElementById('ysn-tags-input')?.value || '';
    return raw
      .split(/[,#]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  function updateBatchButtonVisibility() {
    const btn = document.getElementById('ysn-batch-playlist');
    if (!btn) return;
    const listId = new URL(location.href).searchParams.get('list');
    btn.hidden = !listId;
  }

  async function loadVersionPicker() {
    const wrap = document.getElementById('ysn-versions');
    const sel = document.getElementById('ysn-version-select');
    if (!wrap || !sel || !state.videoId) return;
    const res = await sendMessage({ type: 'GET_NOTE_VERSIONS', videoId: state.videoId }).catch(
      () => null
    );
    const versions = res?.ok ? res.versions || [] : [];
    if (!versions.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = '';
    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      const opt = document.createElement('option');
      opt.value = String(i);
      const when = v.archivedAt || v.updatedAt;
      opt.textContent = when
        ? `${MODE_LABELS[v.mode] || 'Notes'} — ${new Date(when).toLocaleString()}`
        : `Version ${i + 1}`;
      sel.appendChild(opt);
    }
  }

  async function onRestoreVersion() {
    const sel = document.getElementById('ysn-version-select');
    const idx = parseInt(sel?.value, 10);
    if (Number.isNaN(idx) || !state.videoId) return;
    const res = await sendMessage({ type: 'GET_NOTE_VERSIONS', videoId: state.videoId });
    const v = res?.versions?.[idx];
    if (!v?.notesMarkdown) return;
    if (
      document.getElementById('ysn-editor').value.trim() &&
      !confirm('Replace current editor content with this older version?')
    ) {
      return;
    }
    applySavedNote({
      ...state.videoMeta,
      videoId: state.videoId,
      notesMarkdown: v.notesMarkdown,
      mode: v.mode,
      segments: v.segments || state.segments,
    });
    await persistCurrentNote(false);
    setStatus('Restored previous version.', 'success');
  }

  function observeNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        init();
      }
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('yt-navigate-finish', init);
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
      '<p class="ysn-empty">Your formatted notes appear here.</p>';
    document.getElementById('ysn-transcript-stats').textContent = '';
    document.getElementById('ysn-export-actions').style.display = 'none';

    closeHistoryView();

    const saved = await sendMessage({ type: 'GET_LIBRARY' }).catch(() => null);
    if (saved?.ok) {
      const note = saved.library?.find((n) => n.videoId === videoId);
      if (note?.notesMarkdown) applySavedNote(note);
      else loadVersionPicker();
    }
    refreshOllamaStatus();
    updateBatchButtonVisibility();
    chrome.storage.sync.get(['pinPanel'], (d) => {
      if (d.pinPanel) {
        try {
          if (sessionStorage.getItem('ysn_panel_open') === '1') openPanel();
        } catch {
          /* ignore */
        }
      }
    });
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
    if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const t = s.textContent || '';
      const marker = 'ytInitialPlayerResponse';
      const idx = t.indexOf(marker);
      if (idx === -1) continue;
      const start = t.indexOf('{', idx);
      if (start === -1) continue;
      let depth = 0;
      for (let i = start; i < t.length; i++) {
        if (t[i] === '{') depth++;
        else if (t[i] === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(t.slice(start, i + 1));
            } catch {
              break;
            }
          }
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
      el.innerHTML =
        '<div class="ysn-card ysn-card-meta"><p class="ysn-empty">Open a YouTube video to begin.</p></div>';
      return;
    }
    const { title, channel, thumbnail } = state.videoMeta;
    const thumbHtml = thumbnail
      ? `<img class="ysn-thumb" src="${escapeAttr(thumbnail)}" alt="" loading="lazy" />`
      : '<span class="ysn-thumb ysn-thumb-placeholder" aria-hidden="true"></span>';
    el.innerHTML = `
      <div class="ysn-card ysn-card-meta">
        ${thumbHtml}
        <div class="ysn-meta-text">
          <p class="ysn-title">${escapeHtml(title)}</p>
          <p class="ysn-channel">${escapeHtml(channel)}</p>
        </div>
      </div>
    `;
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function isExtensionValid() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function isInvalidatedError(msg) {
    return /context invalidated|extension context/i.test(String(msg || ''));
  }

  function showRefreshRequired() {
    const el = document.getElementById('ysn-status');
    el.className = 'ysn-visible ysn-error';
    el.innerHTML =
      '<span>Extension was reloaded. Refresh this YouTube page (F5) to use the buttons again.</span>' +
      '<button type="button" id="ysn-refresh-page" class="ysn-btn ysn-btn-primary" style="margin-top:10px;width:100%;">Refresh page</button>';
    document.getElementById('ysn-refresh-page')?.addEventListener('click', () => location.reload());
  }

  function showApiKeyRequired() {
    const el = document.getElementById('ysn-status');
    el.className = 'ysn-visible ysn-error';
    el.innerHTML =
      '<span>Add your OpenAI or Gemini API key to generate notes.</span>' +
      '<button type="button" id="ysn-open-settings" class="ysn-btn ysn-btn-primary" style="margin-top:10px;width:100%;">Open Settings</button>';
    document.getElementById('ysn-open-settings')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function requireExtensionContext() {
    if (isExtensionValid()) return true;
    showRefreshRequired();
    return false;
  }

  async function onLoadTranscript() {
    setStatus('Loading transcript…', 'info');
    try {
      const { segments, trackKind } = await loadTranscriptFromPage();
      applyLoadedTranscript(segments, trackKind);
    } catch (e) {
      if (isInvalidatedError(e.message)) showRefreshRequired();
      else {
        setStatus(
          (e.message || 'Failed') +
            ' Tip: open ⋮ → Show transcript on YouTube, or use Capture live CC while the video plays.',
          'error'
        );
      }
    }
  }

  function applyLoadedTranscript(segments, trackKind) {
    state.segments = segments;
    state.trackKind = trackKind;
    document.getElementById('ysn-transcript-stats').textContent = formatStats(segments);
    const badge = trackKind === 'live' ? 'live captions' : trackKind === 'asr' ? 'auto captions' : 'manual captions';
    setStatus(`Transcript loaded (${badge}).`, 'success');
  }

  async function onCaptureLive() {
    if (!requireExtensionContext()) return;
    setStatus('Play the video with CC on. Capturing on-screen captions for ~50s…', 'info');
    setButtonsDisabled(true);
    try {
      const segments = await window.YSN_captureLiveCaptions(50, (pct) => {
        setStatus(`Capturing live captions… ${pct}% (keep video playing)`, 'info');
      });
      applyLoadedTranscript(segments, 'live');
    } catch (e) {
      if (isInvalidatedError(e.message)) showRefreshRequired();
      else setStatus(e.message, 'error');
    } finally {
      setButtonsDisabled(false);
    }
  }

  async function loadTranscriptFromPage() {
    const videoId = state.videoMeta?.videoId || getVideoId();
    if (!videoId) throw new Error('Not on a YouTube video page.');

    let lang = 'en';
    if (isExtensionValid()) {
      try {
        const settings = await sendMessage({ type: 'GET_SETTINGS' });
        lang = settings?.settings?.language || 'en';
      } catch (e) {
        if (!isInvalidatedError(e.message)) throw e;
      }
    }

    const pr = getPlayerResponse();
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    let trackUrl = null;
    let trackKind = 'asr';
    let trackLang = lang;

    if (tracks.length) {
      const track = selectTrack(tracks, lang);
      trackUrl = track?.baseUrl || track?.url || null;
      trackKind = track?.kind || 'manual';
      trackLang = track?.languageCode || lang;
    }

    const segments = await window.YSN_fetchTranscript(trackUrl, videoId, trackLang);
    return { segments, trackKind };
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
    if (!requireExtensionContext()) return;

    const existing = document.getElementById('ysn-editor').value.trim();
    if (existing) {
      const ok = confirm(
        'Replace your current notes with newly generated ones?\n\nThe current version will be saved under Previous versions.'
      );
      if (!ok) return;
    }

    const mode = document.getElementById('ysn-mode').value;
    try {
      chrome.storage.sync.set({ noteMode: mode });
    } catch {
      /* context may be invalid */
    }

    setStatus('Preparing…', 'info');
    if (window.YSN_setProgress) window.YSN_setProgress({ visible: true, pct: 5, label: 'Starting…' });
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

      const settingsRes = await sendMessage({ type: 'GET_SETTINGS' });
      const settings = settingsRes?.settings || {};
      const provider = settings.provider || 'ollama';

      let notesMarkdown;

      if (provider === 'ollama') {
        setStatus('Starting Ollama (warming up model)…', 'info');
        notesMarkdown = await generateNotesViaOllamaPort(mode, state.videoMeta, state.segments, settings);
        const saveRes = await sendMessage({
          type: 'SAVE_NOTE',
          archivePrevious: true,
          note: buildNotePayload(mode, notesMarkdown),
        });
        if (!saveRes?.ok) throw new Error(saveRes?.error || 'Could not save notes.');
      } else {
        setStatus('Generating study notes with AI… This may take a minute.', 'info');
        if (window.YSN_setProgress) {
          window.YSN_setProgress({ visible: true, pct: 40, label: 'AI generating…' });
        }
        const res = await sendMessage({
          type: 'GENERATE_NOTES',
          videoMeta: state.videoMeta,
          segments: state.segments,
          mode,
        });
        if (!res?.ok) throw new Error(res?.error || 'Generation failed.');
        notesMarkdown = res.notesMarkdown;
      }

      state.notesMarkdown = notesMarkdown;
      document.getElementById('ysn-editor').value = notesMarkdown;
      updatePreview(notesMarkdown);
      document.getElementById('ysn-export-actions').style.display = 'block';
      await loadVersionPicker();
      setStatus('Notes generated and saved to your library.', 'success');
    } catch (e) {
      if (isInvalidatedError(e.message)) showRefreshRequired();
      else if (e.message === 'MISSING_API_KEY') showApiKeyRequired();
      else if (/quota|rate.?limit|429/i.test(e.message)) {
        setStatus(
          e.message +
            ' — For free use: switch to Ollama in Settings (runs on your PC, no quota).',
          'error'
        );
      } else setStatus(e.message, 'error');
    } finally {
      state.generating = false;
      setButtonsDisabled(false);
      if (window.YSN_setProgress) window.YSN_setProgress({ visible: false });
    }
  }

  async function onExportMarkdown() {
    if (!requireExtensionContext()) return;
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
    if (!requireExtensionContext()) return;
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

  function buildNotePayload(mode, notesMarkdown) {
    return {
      videoId: state.videoMeta.videoId,
      title: state.videoMeta.title,
      channel: state.videoMeta.channel,
      thumbnail: state.videoMeta.thumbnail,
      mode: mode || document.getElementById('ysn-mode').value,
      notesMarkdown,
      segments: state.segments,
      tags: getTagsFromInput(),
    };
  }

  async function persistCurrentNote(archivePrevious = false) {
    if (!state.videoMeta?.videoId || !isExtensionValid()) return;
    const notesMarkdown = document.getElementById('ysn-editor').value.trim();
    if (!notesMarkdown) return;
    const mode = document.getElementById('ysn-mode').value;
    await sendMessage({
      type: 'SAVE_NOTE',
      archivePrevious,
      note: buildNotePayload(mode, notesMarkdown),
    });
    const hint = document.getElementById('ysn-autosave-hint');
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Saved';
      clearTimeout(state.autosaveHintTimer);
      state.autosaveHintTimer = setTimeout(() => {
        hint.hidden = true;
      }, 2000);
    }
  }

  function onEditorInput() {
    const md = document.getElementById('ysn-editor').value;
    state.notesMarkdown = md;
    updatePreview(md);
    if (md.trim()) document.getElementById('ysn-export-actions').style.display = 'block';
    if (window.YSN_updateReadingStats) window.YSN_updateReadingStats(md);
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => persistCurrentNote(false), 800);
  }

  async function onCopyNotes(plainText) {
    const md = document.getElementById('ysn-editor').value.trim();
    if (!md) {
      setStatus('Nothing to copy.', 'error');
      return;
    }
    const text = plainText ? md.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s/gm, '') : md;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(plainText ? 'Copied as plain text.' : 'Copied markdown.', 'success');
    } catch {
      setStatus('Could not copy — check clipboard permission.', 'error');
    }
  }

  function seekVideo(seconds) {
    const video = document.querySelector('video.html5-main-video, #movie_player video, video');
    if (!video) return;
    video.currentTime = Math.max(0, seconds);
    video.play().catch(() => {});
  }

  function onPreviewClick(e) {
    const link = e.target.closest('.ysn-ts-link');
    if (!link) return;
    e.preventDefault();
    seekVideo(Number(link.dataset.seconds || 0));
  }

  function updatePreview(md) {
    const el = document.getElementById('ysn-preview');
    if (!md.trim()) {
      el.innerHTML = '<p class="ysn-empty">Your formatted notes appear here.</p>';
      return;
    }
    el.innerHTML = markdownToHtml(md);
    linkifyTimestamps(el);
  }

  function linkifyTimestamps(container) {
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
        a.href = '#';
        a.className = 'ysn-ts-link';
        a.dataset.seconds = String(parseTimestamp(m[1]));
        a.title = 'Jump to this time in the video';
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
    if (!isExtensionValid() && type === 'error' && isInvalidatedError(msg)) {
      showRefreshRequired();
      return;
    }
    el.textContent = msg;
    el.className = `ysn-visible ysn-${type || 'info'}`;
  }

  function setButtonsDisabled(disabled) {
    document.getElementById('ysn-generate').disabled = disabled;
    document.getElementById('ysn-load-transcript').disabled = disabled;
    const live = document.getElementById('ysn-capture-live');
    if (live) live.disabled = disabled;
  }

  function sendMessage(msg) {
    if (!isExtensionValid()) {
      return Promise.reject(new Error('Extension context invalidated.'));
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
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

  function generateNotesViaOllamaPort(mode, videoMeta, segments, settings) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const port = chrome.runtime.connect({ name: 'ysn-ollama-generate' });

      const finish = (err, text) => {
        if (finished) return;
        finished = true;
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(text);
      };

      port.onMessage.addListener((msg) => {
        if (msg.type === 'progress') {
          if (msg.merging) setStatus('Merging sections…', 'info');
          else setStatus(`Ollama working… part ${msg.part} of ${msg.total}`, 'info');
          if (window.YSN_setProgress) {
            const pct = msg.total ? Math.round((msg.part / msg.total) * 90) : 30;
            window.YSN_setProgress({
              visible: true,
              pct,
              label: msg.merging ? 'Merging…' : `Part ${msg.part} / ${msg.total}`,
            });
          }
        }
        if (msg.type === 'done') {
          if (msg.ok) finish(null, msg.notesMarkdown);
          else finish(new Error(msg.error || 'Ollama generation failed'));
        }
      });

      port.onDisconnect.addListener(() => {
        if (!finished) {
          finish(
            new Error(
              'Ollama connection lost. Open the Ollama app, confirm model is tinyllama, reload extension and retry.'
            )
          );
        }
      });

      port.postMessage({
        type: 'GENERATE',
        mode,
        videoMeta,
        segments,
        settings,
      });
    });
  }

  async function callOllamaFromPage(msg) {
    const base = (msg.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    const model = msg.model || 'tinyllama';
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
          { role: 'system', content: msg.systemPrompt },
          { role: 'user', content: msg.userContent },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 403) {
        throw new Error(
          'Ollama HTTP 403: Run scripts/setup-ollama-cors.ps1 from the project folder, quit Ollama from the tray, open Ollama again, then retry.'
        );
      }
      let detail = err.trim();
      try {
        const j = JSON.parse(err);
        if (typeof j.error === 'string') detail = j.error;
      } catch {
        /* use raw */
      }
      throw new Error(detail ? `Ollama: ${detail.slice(0, 280)}` : `Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.message?.content?.trim() || '';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'OLLAMA_CHAT') {
      let replied = false;
      const reply = (payload) => {
        if (replied) return;
        replied = true;
        try {
          sendResponse(payload);
        } catch {
          /* channel closed */
        }
      };
      callOllamaFromPage(msg)
        .then((text) => reply({ ok: true, text }))
        .catch((e) => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg.type === 'YSN_OPEN_PANEL') {
      const ok = ensureUi();
      if (ok) openPanel();
      sendResponse({ ok });
      return false;
    }
    if (msg.type === 'BATCH_PROGRESS' && window.YSN_onBatchProgress) {
      window.YSN_onBatchProgress(msg);
      return false;
    }
    return false;
  });
})();
