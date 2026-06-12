# YouTube Study Notes

Chrome extension (Manifest V3) that turns YouTube transcripts into structured study notes, with **Markdown** and **PDF** export.

## Features (v1.2.0)

- Sidebar on any `youtube.com/watch` page (**Alt+S** to open)
- First-run onboarding and **What's new** after updates
- Load captions (manual, auto-generated, or **live on-screen CC** capture)
- **Ollama (free, local)** — recommended; also OpenAI and Gemini (BYOK)
- Note styles: detailed, quick summary, Cornell, exam cram, **flashcards & quiz**
- Chapter-aware outlines when the video has chapters
- Click **[MM:SS]** timestamps in preview to jump in the video
- **Copy** / **Copy MD**, export `.md` (Obsidian-friendly) and PDF
- **Notes history** with search, delete, backup/restore JSON
- **Previous versions** kept when you regenerate (up to 5 per video)
- Auto-save edits to your local library
- Ollama connection status in the sidebar
- **Output language** and **custom prompt template** (Settings)
- **Light theme**, **pin panel**, generation **progress bar**
- **Tags** on notes, **compare versions**, **playlist batch** (up to 20 videos)
- **Anki CSV** export (flashcards / quiz mode)

## Install (developer mode)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `YouTube_study_notes`

## Setup (free with Ollama)

1. Install [Ollama](https://ollama.com) and run: `ollama pull llama3.2:1b` (or `tinyllama` if low RAM)
2. Keep the Ollama app running
3. Extension → **Settings** → provider **Ollama** → Save
4. Open a YouTube video → **Study Notes** → **Generate**

Optional: run `scripts/setup-ollama-cors.ps1` once on Windows if you see HTTP 403.

### Cloud APIs (optional)

- **Gemini** — free tier with limits; API key in Settings
- **OpenAI** — paid; API key in Settings

## GitHub

This folder is its own git repo.

### Push to GitHub (one-time)

```powershell
.\scripts\push-to-github.ps1 -GitHubUser YOUR_GITHUB_USERNAME
```

Privacy policy URL for the Chrome Web Store:

`https://YOUR_GITHUB_USERNAME.github.io/youtube-study-notes/privacy.html`

## Publish to Chrome Web Store

1. Zip the project (exclude `.git`, `scripts/`, dev files)
2. [Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole) ($5 one-time)
3. Upload zip; use GitHub Pages privacy URL
4. Screenshots: 1280×800 (`store-assets/` — main UI + notes history mockup)

## Project structure

```
manifest.json       MV3 entry, keyboard shortcut
background.js       Transcript fetch, LLM, library, Ollama CORS
content/            YouTube sidebar UI
lib/                Prompts, chunking, LLM, storage, export
options/            Provider settings & library backup
popup/              Quick open + recent notes
export/             PDF print view
```

## Library backup

Export all saved notes as JSON from **Notes history** in the sidebar or **Settings → Library backup**. Restore on the same or a new browser profile.

## Cost

With **Ollama**, generation is free on your PC. Cloud APIs are billed by the provider (typically a few cents per long video with mini/flash models).
