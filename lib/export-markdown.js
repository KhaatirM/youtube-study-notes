import { formatTs } from './prompts.js';

/**
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.channel
 * @param {string} params.videoId
 * @param {string} params.notesMarkdown
 * @param {string} [params.mode]
 * @param {{ text: string; start: number }[]} [params.segments]
 */
export function buildMarkdownExport({
  title,
  channel,
  videoId,
  notesMarkdown,
  mode = 'detailed',
  segments,
}) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const date = new Date().toISOString().slice(0, 10);

  let body = stripOuterFences(notesMarkdown);

  const header = `---
title: "${escapeYaml(title)}"
channel: "${escapeYaml(channel)}"
url: ${url}
video_id: ${videoId}
generated: ${date}
mode: ${mode}
source: youtube-study-notes
---

# ${title}

**Channel:** ${channel}  
**Video:** [Watch on YouTube](${url})  
**Generated:** ${date}

---

`;

  let transcriptSection = '';
  if (segments?.length) {
    transcriptSection = `\n\n---\n\n## Transcript (excerpt)\n\n`;
    transcriptSection += segments
      .slice(0, 80)
      .map((s) => `- [${formatTs(s.start)}](${url}&t=${Math.floor(s.start)}s) ${s.text}`)
      .join('\n');
    if (segments.length > 80) {
      transcriptSection += `\n\n_…${segments.length - 80} more lines omitted._`;
    }
  }

  return header + body + transcriptSection;
}

function escapeYaml(s) {
  return String(s).replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function stripOuterFences(md) {
  const trimmed = md.trim();
  const m = trimmed.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/i);
  return m ? m[1].trim() : trimmed;
}

/**
 * @param {string} content
 * @param {string} filename
 */
export function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
