/**
 * Panel extras: onboarding, changelog, theme, progress, batch, compare, anki.
 */
(function () {
  const CHANGELOG = {
    '1.2.0': {
      title: "What's new in 1.2.0",
      items: [
        'First-run guide and update changelog',
        'Notes output language and custom prompt template',
        'Light theme, pin panel, progress bar, reading stats',
        'Library tags, version compare, playlist batch',
        'Anki CSV export for flashcards',
      ],
    },
  };

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
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

  window.YSN_setProgress = function ({ visible, pct = 0, label = '' }) {
    const wrap = document.getElementById('ysn-progress-wrap');
    const fill = document.getElementById('ysn-progress-fill');
    const lbl = document.getElementById('ysn-progress-label');
    if (!wrap) return;
    wrap.hidden = !visible;
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (lbl) lbl.textContent = label;
  };

  window.YSN_updateReadingStats = function (md) {
    const el = document.getElementById('ysn-reading-stats');
    if (!el) return;
    const text = (md || '').replace(/[#*`\[\]]/g, ' ').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (!words) {
      el.textContent = '';
      return;
    }
    const mins = Math.max(1, Math.ceil(words / 200));
    el.textContent = `${words.toLocaleString()} words · ~${mins} min read`;
  };

  async function applyTheme(theme) {
    const root = document.getElementById('ysn-root');
    if (!root) return;
    root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  function showModal(id, html) {
    const host = document.getElementById('ysn-modals');
    if (!host) return;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'ysn-modal-backdrop';
      host.appendChild(el);
    }
    el.innerHTML = html;
    el.hidden = false;
    el.addEventListener('click', (e) => {
      if (e.target === el) el.hidden = true;
    });
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  async function showOnboarding() {
    showModal(
      'ysn-modal-onboarding',
      `
      <div class="ysn-modal ysn-modal-lg" role="dialog">
        <h3>Welcome to YouTube Study Notes</h3>
        <ol class="ysn-onboard-steps">
          <li><strong>Free AI:</strong> Install <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a>, run <code>ollama pull llama3.2:1b</code>, keep it running.</li>
          <li>Open extension <strong>Settings</strong> → choose <strong>Ollama</strong> → Save.</li>
          <li>On any YouTube video, click <strong>Study Notes</strong> or press <strong>Alt+S</strong>.</li>
          <li>Load transcript (or <strong>Live CC</strong>), then <strong>Generate</strong>.</li>
        </ol>
        <div class="ysn-modal-actions">
          <button type="button" class="ysn-btn ysn-btn-primary" id="ysn-onboard-done">Get started</button>
          <button type="button" class="ysn-btn ysn-btn-ghost" id="ysn-onboard-settings">Open Settings</button>
        </div>
      </div>`
    );
    document.getElementById('ysn-onboard-done')?.addEventListener('click', async () => {
      await sendMessage({ type: 'COMPLETE_ONBOARDING' });
      hideModal('ysn-modal-onboarding');
    });
    document.getElementById('ysn-onboard-settings')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  async function showChangelog(version) {
    const entry = CHANGELOG[version];
    if (!entry) return;
    showModal(
      'ysn-modal-changelog',
      `
      <div class="ysn-modal" role="dialog">
        <h3>${escapeHtml(entry.title)}</h3>
        <ul>${entry.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
        <div class="ysn-modal-actions">
          <button type="button" class="ysn-btn ysn-btn-primary" id="ysn-changelog-dismiss">Got it</button>
        </div>
      </div>`
    );
    document.getElementById('ysn-changelog-dismiss')?.addEventListener('click', async () => {
      await sendMessage({ type: 'DISMISS_CHANGELOG' });
      hideModal('ysn-modal-changelog');
    });
  }

  async function checkUiFlags() {
    const res = await sendMessage({ type: 'GET_UI_FLAGS' }).catch(() => null);
    if (!res?.ok) return;
    const settings = await sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
    if (settings?.settings?.theme) applyTheme(settings.settings.theme);
    if (res.showOnboarding) await showOnboarding();
    else if (res.showChangelog && res.lastSeenVersion) await showChangelog(res.lastSeenVersion);
  }

  function wirePinPanel() {
    const pin = document.getElementById('ysn-pin-panel');
    if (!pin) return;
    pin.addEventListener('change', () => {
      chrome.storage.sync.set({ pinPanel: pin.checked });
      if (pin.checked) {
        try {
          sessionStorage.setItem('ysn_panel_open', '1');
        } catch {
          /* ignore */
        }
      }
    });
  }

  function wireCompare() {
    document.getElementById('ysn-compare-version')?.addEventListener('click', async () => {
      const sel = document.getElementById('ysn-version-select');
      const idx = parseInt(sel?.value, 10);
      const videoId = new URL(location.href).searchParams.get('v');
      if (!videoId || Number.isNaN(idx)) return;
      const res = await sendMessage({ type: 'GET_NOTE_VERSIONS', videoId });
      const v = res?.versions?.[idx];
      const current = document.getElementById('ysn-editor')?.value || '';
      const view = document.getElementById('ysn-compare-view');
      if (!v || !view) return;
      document.getElementById('ysn-compare-current').textContent = current;
      document.getElementById('ysn-compare-old').textContent = v.notesMarkdown || '';
      view.hidden = false;
    });
    document.getElementById('ysn-compare-close')?.addEventListener('click', () => {
      const view = document.getElementById('ysn-compare-view');
      if (view) view.hidden = true;
    });
  }

  function wireAnkiExport() {
    document.getElementById('ysn-export-anki')?.addEventListener('click', async () => {
      const md = document.getElementById('ysn-editor')?.value?.trim();
      if (!md) return;
      const title =
        document.querySelector('#ysn-meta .ysn-title')?.textContent?.trim() || 'YouTube Notes';
      const res = await sendMessage({ type: 'BUILD_ANKI_CSV', notesMarkdown: md, deckName: title });
      if (!res?.ok || !res.csv) return;
      await sendMessage({
        type: 'DOWNLOAD_FILE',
        filename: 'study-notes-anki.csv',
        content: res.csv,
        mimeType: 'text/csv',
      });
    });
  }

  let batchModalOpen = false;

  window.YSN_onBatchProgress = function (msg) {
    const label = document.getElementById('ysn-batch-status');
    const bar = document.getElementById('ysn-batch-bar-fill');
    if (!label) return;
    const pct = msg.total ? Math.round((msg.current / msg.total) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    const title = msg.title || msg.videoId || '';
    label.textContent = `${msg.current}/${msg.total} — ${msg.status}${title ? ': ' + title : ''}`;
  };

  async function startBatchPlaylist() {
    const listId = new URL(location.href).searchParams.get('list');
    if (!listId) return;
    const mode = document.getElementById('ysn-mode')?.value || 'detailed';
    showModal(
      'ysn-modal-batch',
      `
      <div class="ysn-modal" role="dialog">
        <h3>Batch generate playlist</h3>
        <p class="ysn-modal-hint">Up to 20 videos. Notes save to your library. Keep Ollama open.</p>
        <div class="ysn-progress-track"><div id="ysn-batch-bar-fill" class="ysn-progress-fill" style="width:0%"></div></div>
        <p id="ysn-batch-status" class="ysn-batch-status">Loading playlist…</p>
        <div class="ysn-modal-actions">
          <button type="button" class="ysn-btn ysn-btn-ghost" id="ysn-batch-cancel">Cancel</button>
        </div>
      </div>`
    );
    batchModalOpen = true;
    document.getElementById('ysn-batch-cancel')?.addEventListener('click', async () => {
      await sendMessage({ type: 'BATCH_CANCEL' });
      hideModal('ysn-modal-batch');
      batchModalOpen = false;
    });
    try {
      const pl = await sendMessage({ type: 'GET_PLAYLIST_VIDEOS', listId, limit: 20 });
      if (!pl?.ok) throw new Error(pl?.error || 'Playlist failed');
      const result = await sendMessage({
        type: 'BATCH_GENERATE',
        videoIds: pl.videoIds,
        mode,
      });
      const label = document.getElementById('ysn-batch-status');
      if (label) {
        label.textContent = `Done: ${result?.done || 0}/${result?.total || 0} saved.${
          result?.errors?.length ? ` ${result.errors.length} failed.` : ''
        }`;
      }
    } catch (e) {
      const label = document.getElementById('ysn-batch-status');
      if (label) label.textContent = e.message || 'Batch failed';
    }
  }

  function wireBatch() {
    document.getElementById('ysn-batch-playlist')?.addEventListener('click', startBatchPlaylist);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.theme) {
      applyTheme(changes.theme.newValue);
    }
  });

  window.YSN_bootFeatures = function () {
    wirePinPanel();
    wireCompare();
    wireAnkiExport();
    wireBatch();
    checkUiFlags();
    chrome.storage.sync.get(['theme'], (d) => applyTheme(d.theme || 'dark'));
  };
})();
