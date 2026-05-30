document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-close').addEventListener('click', () => window.close());

chrome.storage.local.get('ysn_pdf_export', (data) => {
  const payload = data.ysn_pdf_export;
  if (!payload) {
    document.getElementById('doc-body').innerHTML =
      '<p>No export data found. Export from a YouTube video first.</p>';
    return;
  }

  document.getElementById('doc-title').textContent = payload.title || 'Study Notes';
  document.getElementById('doc-channel').textContent = payload.channel
    ? `Channel: ${payload.channel}`
    : '';
  const url = payload.videoId
    ? `https://www.youtube.com/watch?v=${payload.videoId}`
    : '';
  document.getElementById('doc-url').innerHTML = url
    ? `Video: <a href="${url}">${url}</a>`
    : '';
  document.getElementById('doc-date').textContent = `Generated: ${new Date().toLocaleString()}`;
  document.getElementById('doc-body').innerHTML = payload.notesHtml || '';
  document.title = `${payload.title || 'Study Notes'} — PDF`;
});
