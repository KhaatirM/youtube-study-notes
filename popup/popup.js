document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (!tab.url?.includes('youtube.com/watch')) {
    alert('Open a YouTube watch page first (youtube.com/watch?v=…).');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'YSN_OPEN_PANEL' });
  window.close();
});

async function loadLibrary() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_LIBRARY' });
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
