# Babes — landing page

Static holding page for **babesnet.xyz**. No build step, no dependencies — plain HTML and CSS.

## Structure

```
index.html          the page
styles.css          all styling
vercel.json         cache + security headers
robots.txt          / sitemap.xml
assets/
  bg-desktop.webp   background, desktop  (jpg fallback alongside)
  bg-mobile.webp    background, phone    (jpg fallback alongside)
  logo.svg          BABES heart logo
  icon-*.svg        X / Instagram / LinkedIn
  favicon.svg       pink logo, transparent
  og-image.jpg      1200x630 social share card
  fonts/            Instrument Serif Italic + Inter (self-hosted, latin subset)
```

## Local preview

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321

## Notes for future edits

- Built from the Figma file *Babes Net Board* — desktop frame 1440x1024, iPhone 16/17 Pro frame 402x874.
  Type sizes and positions in `styles.css` are expressed as percentages of those two reference frames,
  so the comments give you the original design numbers if you need to re-derive anything.
- The text in the Figma file was flattened to outlines, so the fonts were identified by hand:
  **Instrument Serif Italic** (headline) and **Inter** (everything else). Both are self-hosted in
  `assets/fonts/` — the page makes no external requests.
- Breakpoint is 768px. Below `560px` viewport height there's a separate stacked layout
  so landscape phones don't overflow.
- The background photo is a **fixed, full-viewport `<picture>` layer** (`.bg`), not a CSS
  background. Two reasons: `position: fixed` covers the strip behind the phone's collapsing
  browser toolbars that `100svh` leaves unpainted, and a real `<img>` has a load event, which
  lets the pink base cross-fade into the photo instead of the image popping in.
  WebP with JPEG fallbacks, desktop/mobile chosen by `<source media>`.
- `--pink` is the base colour on `html`/`body`, so nothing can ever flash black — before the
  photo loads, or in any area the photo doesn't reach. It's also the `theme-color`, which tints
  the browser chrome on mobile.

### Inlined SVG — read this before editing the logo or icons

The logo and the three social icons are **inlined directly in `index.html`**, not loaded from
`assets/`. That is deliberate: the hover tint colours individual shapes, and CSS cannot reach
inside an SVG loaded via `<img>`.

`assets/logo.svg` and `assets/icon-*.svg` are kept as the **source masters** — `logo.svg` is what
the favicon and OG image were generated from — but editing them will *not* change the page.
Edit the markup in `index.html`, and update the asset file to match if you want them to stay in sync.

The logo's five `<path class="letter">` elements are the letters B, A, B, E, S in reading order.

### Hover behaviour

Letters and social icons tint to `--pink` (#FC86BA) on hover and drift back to white over 1.5s.
The asymmetry is intentional — `--tint-in` is fast (130ms), `--tint-out` is slow. Both are declared
in `:root` in `styles.css`, so the whole effect retunes from two values. The rule is wrapped in
`@media (hover: hover)` so a tap on a touchscreen never leaves a letter stuck pink.

## Links

- Apply form → Google Forms
- Socials → x.com/babesnetxyz, instagram.com/babesnetxyz, linkedin.com/company/babes-net
