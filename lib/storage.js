const DEFAULT_SETTINGS = {
  provider: 'openai',
  openaiApiKey: '',
  geminiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  geminiModel: 'gemini-2.0-flash',
  noteMode: 'detailed',
  language: 'en',
};

export async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

/**
 * @param {object} note
 */
export async function saveNoteToLibrary(note) {
  const key = `note_${note.videoId}`;
  const entry = {
    ...note,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [key]: entry });

  const { libraryIndex = [] } = await chrome.storage.local.get('libraryIndex');
  const filtered = libraryIndex.filter((id) => id !== note.videoId);
  filtered.unshift(note.videoId);
  const trimmed = filtered.slice(0, 100);
  await chrome.storage.local.set({ libraryIndex: trimmed });
  return entry;
}

export async function getLibraryList() {
  const { libraryIndex = [] } = await chrome.storage.local.get('libraryIndex');
  const keys = libraryIndex.map((id) => `note_${id}`);
  if (!keys.length) return [];

  const data = await chrome.storage.local.get(keys);
  return libraryIndex
    .map((id) => data[`note_${id}`])
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getNote(videoId) {
  const data = await chrome.storage.local.get(`note_${videoId}`);
  return data[`note_${videoId}`] || null;
}
