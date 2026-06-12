const fields = [
  'provider',
  'openaiApiKey',
  'geminiApiKey',
  'openaiModel',
  'geminiModel',
  'ollamaBaseUrl',
  'ollamaModel',
  'noteMode',
  'language',
  'outputLanguage',
  'customPromptAppend',
  'theme',
  'pinPanel',
];

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get(fields);
  const provider = data.provider || 'ollama';
  const radio = document.querySelector(`input[name="provider"][value="${provider}"]`);
  if (radio) radio.checked = true;

  document.getElementById('openaiApiKey').value = data.openaiApiKey || '';
  document.getElementById('geminiApiKey').value = data.geminiApiKey || '';
  document.getElementById('openaiModel').value = data.openaiModel || 'gpt-4o-mini';
  document.getElementById('geminiModel').value = data.geminiModel || 'gemini-1.5-flash';
  document.getElementById('ollamaBaseUrl').value = data.ollamaBaseUrl || 'http://127.0.0.1:11434';
  document.getElementById('ollamaModel').value = data.ollamaModel || 'llama3.2:1b';
  document.getElementById('noteMode').value = data.noteMode || 'detailed';
  document.getElementById('language').value = data.language || 'en';
  document.getElementById('outputLanguage').value = data.outputLanguage || 'en';
  document.getElementById('theme').value = data.theme || 'dark';
  document.getElementById('customPromptAppend').value = data.customPromptAppend || '';
  updateSections();

  document.querySelectorAll('input[name="provider"]').forEach((el) => {
    el.addEventListener('change', updateSections);
  });

  document.getElementById('save').addEventListener('click', save);
  document.getElementById('backup-export').addEventListener('click', exportBackup);
  document.getElementById('backup-import').addEventListener('change', importBackup);
});

function sendBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      resolve(res || { ok: false });
    });
  });
}

async function exportBackup() {
  const res = await sendBg({ type: 'EXPORT_LIBRARY' });
  if (!res?.ok || !res.backup) {
    alert('Could not export library.');
    return;
  }
  const json = JSON.stringify(res.backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube-study-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById('status').textContent = 'Backup downloaded.';
}

async function importBackup(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const res = await sendBg({ type: 'IMPORT_LIBRARY', backup });
    if (!res?.ok) throw new Error(res?.error || 'Import failed');
    document.getElementById('status').textContent = `Imported ${res.imported || 0} note(s).`;
  } catch (e) {
    alert(e.message || 'Invalid backup file.');
  }
}

function updateSections() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;
  document.getElementById('ollama-section').style.opacity = provider === 'ollama' ? '1' : '0.5';
  document.getElementById('openai-section').style.opacity = provider === 'openai' ? '1' : '0.5';
  document.getElementById('gemini-section').style.opacity = provider === 'gemini' ? '1' : '0.5';
}

async function save() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const payload = {
    provider,
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
    openaiModel: document.getElementById('openaiModel').value,
    geminiModel: document.getElementById('geminiModel').value,
    ollamaBaseUrl: document.getElementById('ollamaBaseUrl').value.trim() || 'http://127.0.0.1:11434',
    ollamaModel: document.getElementById('ollamaModel').value.trim() || 'llama3.2:1b',
    noteMode: document.getElementById('noteMode').value,
    language: document.getElementById('language').value.trim() || 'en',
    outputLanguage: document.getElementById('outputLanguage').value || 'en',
    theme: document.getElementById('theme').value || 'dark',
    customPromptAppend: document.getElementById('customPromptAppend').value.trim(),
  };

  await chrome.storage.sync.set(payload);
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => {
    status.textContent = '';
  }, 2500);
}
