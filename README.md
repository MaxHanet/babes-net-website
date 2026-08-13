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
- Backgrounds are served as WebP with JPEG fallbacks via CSS `image-set()`.

## Links

- Apply form → Google Forms
- Socials → x.com/babesnetxyz, instagram.com/babesnetxyz, linkedin.com/company/babes-net
