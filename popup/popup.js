document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (!isYoutubeWatchUrl(tab.url)) {
    alert('Open a YouTube video page first (youtube.com/watch?v=…), then try again.');
    return;
  }

  const opened = await openStudyNotesPanel(tab.id);
  if (!opened) {
    alert(
      'Could not open Study Notes on this tab.\n\n' +
        'Try:\n' +
        '1. Refresh the YouTube page (F5)\n' +
        '2. Click the blue "Study Notes" button at the bottom-right of the video page'
    );
  }
  window.close();
});

function isYoutubeWatchUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, '').includes('youtube.com')) return false;
    return u.pathname === '/watch' && u.searchParams.has('v');
  } catch {
    return false;
  }
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: true });
    });
  });
}

async function injectContentScripts(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content/content.css'],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/transcript-fetch.js', 'content/content.js'],
  });
}

async function openStudyNotesPanel(tabId) {
  let res = await sendMessageToTab(tabId, { type: 'YSN_OPEN_PANEL' });
  if (res?.ok !== false && !res?.error) return true;

  try {
    await injectContentScripts(tabId);
    await new Promise((r) => setTimeout(r, 150));
    res = await sendMessageToTab(tabId, { type: 'YSN_OPEN_PANEL' });
    return res?.ok !== false && !res?.error;
  } catch {
    return false;
  }
}

function runtimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function loadLibrary() {
  const res = await runtimeMessage({ type: 'GET_LIBRARY' });
  const list = document.getElementById('library');
  const empty = document.getElementById('empty');
  list.innerHTML = '';

  if (!res?.ok || !res.library?.length) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  for (const note of res.library.slice(0, 8)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `https://www.youtube.com/watch?v=${note.videoId}`;
    a.target = '_blank';
    a.innerHTML = `${escapeHtml(note.title)}<span class="channel">${escapeHtml(note.channel)}</span>`;
    li.appendChild(a);
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

loadLibrary();
