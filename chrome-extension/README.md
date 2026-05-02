# AssistantX Clinical — Chrome Extension

A **private, unlisted** Chrome extension (Manifest V3) that opens the AssistantX Clinical tab in a browser side panel.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker — opens side panel on icon click |
| `sidepanel.html` | Side panel shell page |
| `sidepanel.js` | Loads the app URL into the iframe |
| `icons/` | Extension icons (16×16, 48×48, 128×128 PNG) |

## Installation (private / unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select this `chrome-extension/` directory
4. The stethoscope icon will appear in your toolbar

## Packaging as `.crx`

To share as a `private.crx` file (no Chrome Web Store required):

```bash
# Using the Chromium CLI
google-chrome --pack-extension=./chrome-extension --pack-extension-key=./my-extension.pem
```

Or use the **Pack extension** button in `chrome://extensions` Developer mode.
The resulting `.crx` file can be distributed privately by sharing the file directly.
Recipients install it via drag-and-drop onto `chrome://extensions`.

## Configuration

The extension defaults to `http://localhost:3000` (local dev).
To point to your production URL, update `sidepanel.js` or set `clinicalHost` in
`chrome.storage.sync` via the extension options page.
