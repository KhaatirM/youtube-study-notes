const DEFAULT_SETTINGS = {
  provider: 'ollama',
  openaiApiKey: '',
  geminiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  geminiModel: 'gemini-1.5-flash',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2:1b',
  noteMode: 'detailed',
  language: 'en',
  outputLanguage: 'en',
  customPromptAppend: '',
  pinPanel: false,
  theme: 'dark',
  onboardingComplete: false,
};

const MAX_LIBRARY = 100;
const MAX_VERSIONS_PER_VIDEO = 5;

export async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

export async function setUiFlags(flags) {
  await chrome.storage.local.set(flags);
}

export async function getUiFlags() {
  return chrome.storage.local.get([
    'showOnboarding',
    'showChangelog',
    'lastSeenVersion',
    'batchState',
  ]);
}

/**
 * @param {object} note
 * @param {{ archivePrevious?: boolean }} options
 */
export async function saveNoteToLibrary(note, options = {}) {
  if (options.archivePrevious) {
    const existing = await getNote(note.videoId);
    if (existing?.notesMarkdown?.trim()) {
      await pushNoteVersion(note.videoId, existing);
    }
  }

  const tags = normalizeTags(note.tags);
  const key = `note_${note.videoId}`;
  const entry = {
    ...note,
    tags,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [key]: entry });

  const { libraryIndex = [] } = await chrome.storage.local.get('libraryIndex');
  const filtered = libraryIndex.filter((id) => id !== note.videoId);
  filtered.unshift(note.videoId);
  await chrome.storage.local.set({ libraryIndex: filtered.slice(0, MAX_LIBRARY) });
  return entry;
}

export function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  }
  if (typeof tags === 'string') {
    return normalizeTags(tags.split(/[,#]+/));
  }
  return [];
}

export async function deleteNoteFromLibrary(videoId) {
  const key = `note_${videoId}`;
  await chrome.storage.local.remove([key, `versions_${videoId}`]);

  const { libraryIndex = [] } = await chrome.storage.local.get('libraryIndex');
  await chrome.storage.local.set({
    libraryIndex: libraryIndex.filter((id) => id !== videoId),
  });
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

async function pushNoteVersion(videoId, snapshot) {
  const vkey = `versions_${videoId}`;
  const data = await chrome.storage.local.get(vkey);
  const versions = data[vkey] || [];
  versions.unshift({
    notesMarkdown: snapshot.notesMarkdown,
    mode: snapshot.mode,
    segments: snapshot.segments,
    updatedAt: snapshot.updatedAt,
    archivedAt: Date.now(),
  });
  await chrome.storage.local.set({ [vkey]: versions.slice(0, MAX_VERSIONS_PER_VIDEO) });
}

export async function getNoteVersions(videoId) {
  const vkey = `versions_${videoId}`;
  const data = await chrome.storage.local.get(vkey);
  return data[vkey] || [];
}

export async function exportLibraryBackup() {
  const library = await getLibraryList();
  const versionKeys = library.map((n) => `versions_${n.videoId}`);
  const versionData = versionKeys.length ? await chrome.storage.local.get(versionKeys) : {};
  return {
    format: 'youtube-study-notes-library',
    version: 2,
    exportedAt: Date.now(),
    notes: library,
    versions: versionData,
  };
}

export async function importLibraryBackup(backup) {
  if (!backup?.notes?.length) {
    throw new Error('Invalid backup file: no notes found.');
  }
  if (backup.format && backup.format !== 'youtube-study-notes-library') {
    throw new Error('Unrecognized backup format.');
  }

  const toSet = {};
  const index = [];
  for (const note of backup.notes) {
    if (!note?.videoId) continue;
    toSet[`note_${note.videoId}`] = {
      ...note,
      tags: normalizeTags(note.tags),
      updatedAt: note.updatedAt || Date.now(),
    };
    index.push(note.videoId);
  }

  if (backup.versions && typeof backup.versions === 'object') {
    for (const [key, versions] of Object.entries(backup.versions)) {
      if (key.startsWith('versions_') && Array.isArray(versions)) {
        toSet[key] = versions.slice(0, MAX_VERSIONS_PER_VIDEO);
      }
    }
  }

  const { libraryIndex = [] } = await chrome.storage.local.get('libraryIndex');
  const merged = [...new Set([...index, ...libraryIndex])].slice(0, MAX_LIBRARY);
  toSet.libraryIndex = merged;
  await chrome.storage.local.set(toSet);
  return { imported: index.length };
}
