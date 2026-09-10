# FileBurst

FileBurst turns one oversized PDF into numbered, message-ready PDF parts and guides the sender through them in order.

## First working version

- Opens PDFs directly from a phone or computer.
- Splits by an actual maximum output size, not only by page count.
- Names every file `Part 01 of N`, `Part 02 of N`, and so on.
- Uses the device share sheet when file sharing is supported.
- Remembers the intended recipient and advances the queue after each completed share.
- Falls back to downloading the current part when direct sharing is unavailable.
- Processes documents locally in the browser.
- Installs as a progressive web app.

## Important platform behavior

Apple and Android require user approval before a personal SMS/MMS is sent. The web version therefore prepares each part and advances the sequence after the share sheet closes. The `FileBurstNative.sharePart` bridge in `app.js` is reserved for the iPhone and Android wrappers, where the recipient can be prefilled for every part.

## Run locally

Serve the repository over HTTP; PDF processing and the service worker do not run correctly from a `file://` URL.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Roadmap

1. Validate the web splitting and guided-send workflow on real field reports.
2. Add native iPhone and Android shells using the existing bridge.
3. Add interruption-safe queue persistence for native builds.
4. Add adaptive presets for Messages, email, and upload portals.
