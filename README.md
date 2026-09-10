# Babes — landing page

Static site for **babesnet.xyz**. Plain HTML and CSS — no build step, no dependencies,
no framework. Opening `index.html` in a browser is a faithful preview of production,
with one exception: the newsletter signup posts to a serverless function, and that
needs `vercel dev` (see [Local preview](#local-preview)).

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
scripts.js          all behaviour, including the email pop-up's markup
api/subscribe.js    the only server-side code: newsletter signup → Resend
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
  popup/            the two email pop-up photos, portrait + wide crops
```

Total page weight ≈ 430KB, dominated by the background photo. The pop-up adds
~75KB, lazily — one photo in one crop, fetched only if it actually opens.

## Local preview

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321. Everything works except the signup form, which
posts to `/api/subscribe` and needs the real runtime:

```bash
vercel env pull && vercel dev
```

---

## The newsletter signup

The email pop-up is the only part of this site with a server side. It posts to
`api/subscribe.js`, which adds the address to a **Resend Audience**.

Already provisioned and live. Resend was installed through the Vercel Marketplace
(`resend-email-aero-bell`, free plan, connected to this project), so the API key
is injected by the integration rather than pasted in by hand.

| | | |
|---|---|---|
| `RESEND_API_KEY` | injected by the integration | never in this repo |
| `RESEND_EMAIL_DOMAIN` | injected by the integration | `babesnet.xyz` |
| `RESEND_AUDIENCE_ID` | set manually | Audience "Babes Net Newsletter" |

**The list lives in `eu-west-1` (Ireland), on purpose.** The subscriber list is
the only genuinely personal data the site holds and much of the audience is in
the EU, so keeping it there avoids the international-transfer question entirely.
`/privacy` says so. Region can't be changed without re-provisioning and migrating
contacts, so don't casually re-create this resource elsewhere.

Resend's free tier covers 1,000 contacts and 3,000 sends a month. **The 1,000
contact ceiling is the thing to watch** — past it the list needs a paid plan.

If the credentials ever go missing the endpoint returns 503 and the pop-up shows
an error, on purpose: thanking someone for a subscription that silently went
nowhere is the one failure worth admitting to.

### Still to do before the first newsletter

`babesnet.xyz` is **not yet verified for sending** (`status: not_started`).
Collecting addresses works without it — sending does not. Verifying adds DKIM and
SPF records; per the rule above, those are TXT records and **do not touch the
Zoho MX records**. Watch the SPF one: if Zoho already publishes an SPF record,
Resend's include must be merged into it rather than added as a second record.

### Deploying this project from the CLI

Don't. It builds from GitHub — push to `main`. `vercel deploy` from this
directory ignores `.gitignore` and tries to upload the ~900MB of raw photos and
video sitting in the working tree; `.vercelignore` now blocks that, but
`vercel redeploy <url>` is the right tool if you need to rebuild with new
environment variables (they only take effect on a fresh deployment).

### How it's defended

There is no CAPTCHA. The defences are all code-level, and layered so that no
single one has to be perfect: `POST`-only, an Origin/Referer allowlist, a
honeypot field, a minimum dwell time, strict address validation, a
disposable-domain blocklist, a best-effort per-IP throttle, and a response that
is byte-identical whether an address was new, already subscribed, or silently
dropped.

Two things worth knowing:

- **The endpoint never sends mail.** That's deliberate. An endpoint that emails
  whatever address it's handed is a mail cannon pointed at strangers' inboxes.
  The confirmation is drawn in the pop-up instead.
- **The per-IP throttle is best effort, not a guarantee.** Its counters live in
  the function instance's memory, so they're per-instance and per-region. If real
  abuse ever turns up, the fix is a Vercel Firewall rate-limit rule on
  `POST /api/subscribe` — a dashboard change, no code (needs a Pro plan).

The pop-up's consent line links to `/privacy`, which describes what's actually
collected: the address itself, the transient IP used for rate limiting, Vercel's
cookieless analytics, and the three `localStorage` keys the pop-up sets. Keep it
truthful — if the data flow changes, that page changes with it, and so does the
date at its top.

**Two things it doesn't yet say**, because they need your input rather than mine:

- **The legal entity.** It names "Babes Net" and `hello@babesnet.xyz` as the
  contact. If there's a registered company name and address, GDPR expects them.
  Note the founders are Dubai-based while the audience is substantially EU, so
  GDPR applies by targeting rather than establishment.
- **Consent proof isn't stored.** Resend records the contact and a created-at,
  but not the IP, timestamp and wording shown at the moment of signup. Evidencing
  consent properly would need a database alongside Resend.

It's a factual description of the site's behaviour, not legal advice — worth a
read by someone qualified before you lean on it.

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
  `assets/fonts/` — the page makes **no external requests from the browser**, which is worth
  preserving. The one call to Resend is made server-side, from the function, so a visitor's
  browser still only ever talks to babesnet.xyz.
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

### The email pop-up

Built from Figma nodes `168:22` and `168:46` — *Email Pop Up 1 / 2 - Desktop*, both 750x400 and
identical bar the photo. `styles.css` scopes its own design-pixel unit, `--pu`, to that 750-wide
frame, exactly as `--u` does for the page's 1440 one, so every figure in the CSS is the literal
number from the file. Measured geometry matches the frame to the pixel.

Three things are not in the drawing, and shouldn't surprise you:

- **No phone frame was ever drawn.** The phone layout is derived: the same card turned vertical,
  photo across the top in a 3:2 crop, 11px cream frame kept on all four sides.
- **The close button moved ~9px inward.** The design puts the glyph 3.7px from the card's right
  edge, which leaves no room for a hit area worth the name. It sits at 22px so a full 44px target
  fits inside the card.
- **The markup lives in `scripts.js`, not in the three HTML files.** The pop-up is inert without
  JS, so a no-script visitor loses nothing by its absence — and one template beats three copies
  of a forty-line block drifting apart.

The two photos alternate: a visitor's second sighting is the one they didn't get the first time.
Sources are set at open time, so an unseen pop-up downloads nothing.

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
