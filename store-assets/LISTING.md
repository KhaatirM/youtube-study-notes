# Chrome Web Store listing — copy/paste

## Privacy policy URL

https://khaatirm.github.io/youtube-study-notes/privacy.html

## Short description (max 132 chars)

Turn YouTube captions into study notes. Free with Ollama. Export Markdown, PDF, flashcards. Local library—no account required.

## Detailed description

YouTube Study Notes helps students turn lecture videos into structured study material—without leaving YouTube.

**Free by default:** Use Ollama on your PC (no API key, no billing). Optional OpenAI or Gemini if you bring your own key.

**Features:**
- Sidebar on any YouTube watch page (Alt+S)
- Load captions, or capture on-screen CC when needed
- Note styles: detailed, quick summary, Cornell, exam cram, flashcards & quiz
- Click timestamps to jump in the video
- Edit notes, auto-save, version history
- Export Markdown, PDF, Anki CSV
- Local notes library with search and tags
- Playlist batch (up to 20 videos)

**Privacy:** Notes stay on your device. No developer backend. Cloud AI only if you add your own API key.

## Single purpose

Generate and manage study notes from YouTube video transcripts.

## Permission justifications (paste in dashboard)

| Permission | Justification |
|------------|---------------|
| storage | Save notes library, settings, and backups locally on the user's device. |
| activeTab | Access the current YouTube tab when the user opens the panel or popup. |
| scripting | Inject the study notes sidebar when the user clicks "Open on current tab" if the content script is not loaded yet. |
| downloads | Save exported Markdown, PDF, CSV, and JSON backup files when the user chooses Export. |
| declarativeNetRequestWithHostAccess | Modify the Origin header on requests to the user's local Ollama server so note generation works (browser CORS). |
| host: youtube.com | Display the notes panel and read public caption tracks on pages the user visits. |
| host: localhost / 127.0.0.1 | Optional local AI (Ollama) on the user's own computer only—not remote servers. |
| host: api.openai.com | Optional: send transcript to OpenAI only when user configures their own API key and generates notes. |
| host: generativelanguage.googleapis.com | Optional: send transcript to Gemini only when user configures their own API key and generates notes. |

## Screenshots

Use `store-assets/screenshot-store-1280x800.png` (1280×800).

## Resubmission note (if rejected)

Version 1.0.0 had a manifest JSON syntax error (trailing comma). Fixed in 1.2.0. Extension tested on YouTube watch pages with Ollama and caption loading.
