# quickresponse.now

**Live: <https://quickresponse.now/>**

A free QR code generator that runs entirely in your browser. No account, no expiry, no
watermark, no adverts. Nothing you type is uploaded or stored, and the page works offline.

## What it does

Makes QR codes for:

- **Links and text** — paste a web address and it opens as a link; anything else is shown as text
- **Wi‑Fi** — scan to join a network without typing the password (`WIFI:` format)
- **Contact cards** — saved to the phone as a standard vCard 3.0
- **Email** (`mailto:` with subject and body), **SMS** (`SMSTO:`), **phone** (`tel:`)
- **Locations** (`geo:` latitude/longitude, opens in the phone's maps app)

Styling: code and background colour with presets, square / rounded / dot modules, and
error-correction level L–H ("damage tolerance"). Output as SVG (any size, for print), PNG at
512–4096 px, copy-to-clipboard, or a print layout that puts just the code on the page.

A **"Will it scan?"** readout checks the things that actually make codes fail: contrast ratio,
inverted colours (light-on-dark), and the minimum print size / scan distance for that exact code.

`?url=…` or `?text=…` in the address prefills the generator, so it can be linked to directly.

## How it works

- A single static page: `index.html`, `styles.css`, `app.js`. No build step, no backend, no
  analytics scripts.
- Encoding is done by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  by Kazuhiko Arase (MIT), vendored as `qrcode.js`. The module matrix it produces is rendered by
  this project's own painter into SVG (for the preview and SVG download) and onto a canvas (for
  PNG and clipboard), so both outputs share one geometry. Finder patterns are always drawn solid
  so scanners lock on whatever module style is chosen.
- Only style preferences are remembered (`localStorage`); content never is.
- Installable PWA: `manifest.json` plus a service worker (`sw.js`) that serves code network-first
  and images cache-first, so a deploy shows up immediately online and everything works offline.
- Hosted as static files on S3 behind CloudFront with a strict Content-Security-Policy
  (`script-src 'self'`, no inline scripts or styles) — which is why the encoder is vendored rather
  than loaded from a CDN.

## Why free, and why codes don't expire

A QR code is just a picture: the modules *are* the encoded text. There is no server between the
code and the content, so there is nothing to host, expire, or charge for. Services whose "free"
codes stop working route them through their own redirect — that is how they can switch them off.

## Licence

MIT — see [LICENSE](LICENSE). The bundled encoder keeps its own MIT notice in `qrcode.js`.

Built by Adam Woodland with the assistance of AI (Anthropic Claude).
