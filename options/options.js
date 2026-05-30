const fields = [
  'provider',
  'openaiApiKey',
  'geminiApiKey',
  'openaiModel',
  'geminiModel',
  'noteMode',
  'language',
];

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get(fields);
  if (data.provider) {
    document.querySelector(`input[name="provider"][value="${data.provider}"]`).checked = true;
  }
  document.getElementById('openaiApiKey').value = data.openaiApiKey || '';
  document.getElementById('geminiApiKey').value = data.geminiApiKey || '';
  document.getElementById('openaiModel').value = data.openaiModel || 'gpt-4o-mini';
  document.getElementById('geminiModel').value = data.geminiModel || 'gemini-2.0-flash';
  document.getElementById('noteMode').value = data.noteMode || 'detailed';
  document.getElementById('language').value = data.language || 'en';
  updateSections();

  document.querySelectorAll('input[name="provider"]').forEach((el) => {
    el.addEventListener('change', updateSections);
  });

  document.getElementById('save').addEventListener('click', save);
});

function updateSections() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;
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
    noteMode: document.getElementById('noteMode').value,
    language: document.getElementById('language').value.trim() || 'en',
  };

  await chrome.storage.sync.set(payload);
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => {
    status.textContent = '';
  }, 2500);
}
