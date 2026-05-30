/** ~3500 chars per chunk to stay within token limits */
const MAX_CHUNK_CHARS = 3500;

/**
 * @param {{ text: string; start: number; duration?: number }[]} segments
 * @returns {{ text: string; start: number; segments: typeof segments }[]}
 */
export function chunkTranscript(segments) {
  if (!segments?.length) return [];

  const chunks = [];
  let current = [];
  let charCount = 0;

  for (const seg of segments) {
    const line = seg.text.trim();
    if (!line) continue;
    const add = line.length + 20;

    if (charCount + add > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(packChunk(current));
      current = [];
      charCount = 0;
    }
    current.push(seg);
    charCount += add;
  }

  if (current.length) chunks.push(packChunk(current));
  return chunks;
}

function packChunk(segments) {
  const text = segments.map((s) => s.text.trim()).join(' ');
  return { text, start: segments[0].start, segments };
}
