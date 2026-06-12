/** Release notes shown once after install/update. */
export const EXTENSION_VERSION = '1.2.0';

export const CHANGELOG = {
  '1.2.0': {
    title: 'Study smarter',
    items: [
      'First-run guide and what’s new on updates',
      'Notes language, custom prompt template, light theme',
      'Pin panel open, progress bar, reading time stats',
      'Tags in library, compare versions side-by-side',
      'Playlist batch generate, Anki/CSV export',
    ],
  },
  '1.1.1': {
    title: 'Refreshed design',
    items: ['New sidebar look', 'Video thumbnails in header', 'Polished history view'],
  },
};

export function getChangelogForVersion(version) {
  return CHANGELOG[version] || null;
}
