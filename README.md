# YouTube Study Notes

Chrome extension (Manifest V3) that turns YouTube transcripts into structured study notes, with **Markdown** and **PDF** export.

## Features

- Sidebar on any `youtube.com/watch` page
- Load captions (manual or auto-generated)
- Generate notes via **OpenAI** or **Google Gemini** (bring your own API key)
- Note styles: detailed, quick summary, Cornell, exam cram
- Edit notes before export
- Export `.md` with YAML frontmatter (Obsidian-friendly)
- Export PDF via print-ready page (Save as PDF)
- Local library of recent notes

## Install (developer mode)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `YouTube_study_notes`

## Setup

1. Click the extension icon → **Settings** (or right-click → Options)
2. Choose **OpenAI** or **Gemini**
3. Paste your API key and save
4. Open a YouTube video with captions (CC)
5. Click **Study Notes** (bottom-right) → **Generate notes**

## Publish to Chrome Web Store

1. Zip the project (exclude `.git`, `scripts/`, dev files)
2. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time)
3. Upload the zip as a new item
4. Use `privacy.html` hosted on GitHub Pages (or similar) as your privacy policy URL
5. Add screenshots (1280×800) and icons (already in `icons/`)

## Project structure

```
manifest.json       MV3 entry
background.js       Transcript fetch, LLM, downloads
content/            YouTube sidebar UI
lib/                Prompts, chunking, LLM, export helpers
options/            API keys & defaults
popup/              Recent library
export/             PDF print view
privacy.html        Store privacy policy
```

## Cost estimate

Typical 20-minute lecture: ~2–8 API calls (chunked). With `gpt-4o-mini` or `gemini-2.0-flash`, cost is usually a few cents per video.

## License

MIT — use and modify freely.
