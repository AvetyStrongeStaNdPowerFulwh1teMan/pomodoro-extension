# Pomodoro Timer Chrome Extension

This folder is a Chrome extension version of the Pomodoro timer.

## Sound

Add your MP3 file here:

```text
assets/lofi.mp3
```

The timer plays that file when work ends and when break ends. If there is no MP3 yet, it falls back to a short generated beep.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `pomodoro-extension`.

The timer state and productivity calendar are stored in Chrome extension storage.

## Open source & safety

There are **no API keys or server credentials** in this codebase: everything runs in the browser and saves settings in `chrome.storage.local` only.

Before publishing or opening a pull request:

- Do **not** commit Chrome Web Store **private keys** (`.pem`), publishing tokens, or `.env` files with secrets. Common patterns are ignored via `.gitignore`.
- Optional sound files under `assets/` (e.g. `lofi.mp3`) are **ignored** so you do not accidentally commit large or licensed audio—copy your file locally after clone.

If you ever add network features, use environment-specific config **outside** the repo and document placeholders only (e.g. `.env.example` with dummy values).
