# Babes — landing page

Static holding page for **babesnet.xyz**. Plain HTML and CSS — no build step, no dependencies,
no framework. Opening `index.html` in a browser is a faithful preview of production.

---

## Where it lives

| | |
|---|---|
| **Live site** | https://babesnet.xyz |
| **Host** | Vercel — deploys automatically from `main` |

### Deploying

Push to `main`. That's the whole process — Vercel is connected to the repo and deploys
automatically. There is no build command and no output directory; Vercel serves the files as-is.

```bash
git add -A && git commit -m "..." && git push
```

Live within about a minute. Check the commit status on GitHub, or the Vercel dashboard.

### DNS

Already configured — nothing to do. The specific records live in `NOTES.private.md`
(git-ignored), not here.

One rule worth stating in the open, because getting it wrong is expensive: **web records are
A/CNAME, email records are MX/TXT, and they are independent.** Changing the site's hosting
never requires touching the email records. Deleting the SPF record will quietly send outbound
mail to spam.

---

## Structure

```
index.html          the page — including the inlined logo and social SVGs
styles.css          all styling
vercel.json         cache headers (1yr immutable on /assets) + security headers
robots.txt          / sitemap.xml
.claude/            local dev-server config for the preview tool
assets/
  bg-desktop.webp   background, desktop  (jpg fallback alongside)
  bg-mobile.webp    background, phone    (jpg fallback alongside)
  logo.svg          BABES heart logo — source master
  icon-*.svg        X / Instagram / LinkedIn — source masters
  favicon.svg       pink logo, transparent
  favicon-32.png    / apple-touch-icon.png
  og-image.jpg      1200x630 social share card
  fonts/            Instrument Serif Italic + Inter (self-hosted, latin subset)
```

Total page weight ≈ 430KB, dominated by the background photo.

## Local preview

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321

---

## Open items

Small things left deliberately, none of them blocking:

- [ ] **Primary domain is `www`, but the page declares the bare domain canonical.**
      `babesnet.xyz` currently 308-redirects to `www.babesnet.xyz`, while `index.html` has
      `<link rel="canonical" href="https://babesnet.xyz/">` and `sitemap.xml` agrees.
      Fix by setting `babesnet.xyz` as primary in Vercel → Settings → Domains (no code change),
      **or** by flipping `canonical`, `og:url` and `sitemap.xml` to the www form. They just need
      to agree with each other.
- [ ] **Favicon is mushy at 16px.** The heart-with-lettering is too fine to survive that size.
      A simplified mark would help, but that's a brand decision, not a code one.

Outstanding DNS and email items are tracked in `NOTES.private.md`.

---

## Notes for future edits

- Built from the Figma file *Babes Net Board* — desktop frame 1440x1024, iPhone 16/17 Pro frame 402x874.
  Type sizes and positions in `styles.css` are expressed as percentages of those two reference frames,
  so the comments give you the original design numbers if you need to re-derive anything.
  Everything was measured against the design's actual vector geometry and matches within ~1px.
- The text in the Figma file was flattened to outlines, so the fonts were identified by hand:
  **Instrument Serif Italic** (headline) and **Inter** (everything else). Both are self-hosted in
  `assets/fonts/` — the page makes **no external requests at all**, which is worth preserving.
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

### One deliberate deviation from the Figma file

In the desktop frame, the "new website coming soon / head over to our socials" block sits about
**8px right of centre**, while the logo and social icons are dead-centre. On the phone frame it
is centred. That read as a nudged text box rather than an intention, so it's centred here.
Everything else matches the design.

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

### Adding pages later

`vercel.json` sets `cleanUrls: true`, so `about.html` will serve at `/about`. Add new pages as
sibling HTML files and link them normally. If the site grows past a handful of pages, that's the
point to reconsider a static-site generator — but nothing here needs one yet.

---

## Links

- **Apply form** → Google Forms (`docs.google.com/forms/d/e/1FAIpQLSc…/viewform`)
- **Socials** → [x.com/babesnetxyz](https://x.com/babesnetxyz) ·
  [instagram.com/babesnetxyz](https://instagram.com/babesnetxyz) ·
  [linkedin.com/company/babes-net](https://linkedin.com/company/babes-net)

## Brand values in use

| | |
|---|---|
| Pink | `#FC86BA` |
| White | `#FFFFFF` |
| "Apply here" | `#FDFDF3` |
| Headline | Instrument Serif, italic, 400 |
| Body | Inter, 400 |
