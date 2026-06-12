/** @param {string} markdown */
export function computeReadingStats(markdown) {
  const text = (markdown || '').replace(/[#*`\[\]()>-]/g, ' ').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const readMin = Math.max(1, Math.ceil(words / 200));
  return { words, readMin };
}
