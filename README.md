# Babes — landing page

Static site for **babesnet.xyz**. Plain HTML and CSS — no build step, no dependencies,
no framework. Opening `index.html` in a browser is a faithful preview of production,
with one exception: the newsletter signup posts to a serverless function, and that
needs `vercel dev` (see [Local preview](#local-preview)). The other function, the Luma
events proxy, is mirrored by `devserver.py` and previews without it.

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
events.html         upcoming + past events, served at /events — the cards
                    between the build: markers are generated, see below
styles.css          all styling
scripts.js          all behaviour, including the email pop-up's markup
lib/luma.js         reads the Luma calendar; shared by the two below
scripts/build-events.js
                    writes the event cards into events.html — run it when
                    the calendar changes
api/subscribe.js    newsletter signup → Resend
api/luma-events.js  the same Luma data as JSON, for debugging
vercel.json         301s for the old Webflow URLs + cache headers (1yr
                    immutable on /assets, no-store on /api/subscribe) +
                    security headers
robots.txt          / sitemap.xml
llms.txt            the site in plain text, for LLM crawlers
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

The email pop-up is one of the site's two server-side pieces (the other reads past events
from Luma — see [The events page](#the-events-page)). It posts to
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

### Sending — verified 2026-09-10

`babesnet.xyz` is verified. A test from `hello@babesnet.xyz` delivered cleanly.

Four DNS records were added at Namecheap. **Resend scopes its records to
subdomains, so none of them touch Zoho** — worth knowing before anyone panics
about the SPF rule above:

| Type | Host | Purpose |
|---|---|---|
| `TXT` | `resend._domainkey` | DKIM signing key |
| `TXT` | `send` | SPF for the sending subdomain |
| `MX` | `send` | SES bounce/complaint feedback |
| `TXT` | `_dmarc` | `p=none`, monitor-only |

The root `MX` (Zoho) and root `TXT` SPF (`include:zohomail.com`) are untouched
and must stay that way. In Namecheap the TXT records live under **Host Records**
and the MX under **Mail Settings** — the `send` MX is an extra row alongside
Zoho's `@` rows, never a replacement for them.

DMARC is the one record that *is* domain-wide, covering Zoho mail too. It sits at
`p=none` deliberately: monitor-only, so it cannot cause any mail to be rejected.
Don't tighten it to `quarantine` or `reject` without first reading the `rua`
reports and confirming Zoho mail passes alignment.

**Two constraints on the first newsletter:**

- The `from` address must be `@babesnet.xyz` exactly. A mismatch is a silent 403.
- A newly verified domain is throttled — roughly **150 emails on day one**,
  ramping up as reputation builds. A blast to 800 people on day one will not
  land. Warm it up.

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

### The events page

`/events` shows upcoming and past events from the Babes Net Luma calendar
(`cal-mqlFFooPRU3qIZi` — [lu.ma/babesnet](https://lu.ma/babesnet)). **Publishing an event on
Luma is the whole workflow.** It appears on the site by itself; nothing in this repo changes
per event.

Both lists are written into `events.html` by `scripts/build-events.js`, which reads the
calendar through `lib/luma.js`. **Publishing on Luma puts the event on the site only after
that script runs** — see [Regenerating the event cards](#regenerating-the-event-cards) below.
Registration is not ours: each Register button carries Luma's official checkout hook —

```html
<a href="…" data-luma-action="checkout" data-luma-event-id="evt-…">Register</a>
```

— and `embed.lu.ma/checkout-button.js` opens Luma's own modal over the page. We draw the
list, they take the RSVP. The `<a>` keeps a real `href`, so if their script is blocked the
click degrades to a normal trip to the event page. Loading that script is now the only thing
`scripts.js` does on this page.

#### Regenerating the event cards

```bash
node scripts/build-events.js
```

Run it when the Luma calendar changes, and commit what it touches. It rewrites everything
between the `<!-- build:upcoming -->` and `<!-- build:past -->` markers in `events.html` and
leaves the rest of the file alone. **Don't hand-edit inside the markers** — the next run
overwrites it. Two things worth knowing: a run that can't reach Luma exits non-zero and
leaves the file exactly as it was (an empty page is not the right answer to a network
error), and a run that reaches an empty calendar writes the "nothing on the calendar"
line and drops the past section entirely.

The trade is freshness. The page is as current as the last run, not as current as Luma, so
a new event needs a regenerate-and-push to appear. That is the price of the next section.

#### Why the cards aren't built in the browser

They were, until an SEO audit in September 2026 found the page was invisible. The markup
only existed after `scripts.js` fetched `/api/luma-events` — and `robots.txt` disallows
`/api/`. A crawler rendering the page had that fetch refused and indexed the one line that
was actually in the HTML: *"Nothing on the calendar this minute."* The site's only page of
real, recurring content read as an empty page to every search engine and answer engine
looking at it.

Generating the cards ahead of time puts 26 event names, dates and cities in the HTML that
ships. Nothing has to run for them to be read. This is also what makes Event structured
data possible later — schema describing events that aren't in the page would be worse than
none.

`robots.txt` keeps `Disallow: /api/`. It is correct now that no page depends on a call
through it.

#### Why not the calendar embed

The obvious build was Luma's calendar iframe (`lu.ma/embed/calendar/<cal>/events?lt=light`)
and it was the first version of this page. It was replaced because **it cannot be sized.**
The iframe never posts its height — verified, it sends no `postMessage` at all — so the box
is a fixed guess: a grey acre around a single event, a scrollbar once there are five.
Nothing in the embed's API fixes that; there is no auto-height and no alternative layout
(`/list`, `/grid`, `/compact` and friends are all 404 — `/events` is the only calendar embed
route Luma serves).

Drawing the cards ourselves sizes them to whatever is on the calendar, keeps one visual
language down the page, and costs nothing that wasn't already being fetched.

#### Reading the calendar

⚠ **`lib/luma.js` calls an undocumented endpoint.** `api.lu.ma/calendar/get-items` is
what luma.com's own front end uses. It is public, needs no key and sends no CORS headers
(hence the proxy) — but it is *not* Luma's documented API, which wants a Luma Plus key. It
can change without notice. Everything downstream is built for that: the build script stops
and changes nothing, and `api/luma-events.js` answers `200 {"upcoming": [], "past": []}`. If
events quietly vanish from the page one day, this is the first place to look.

`api/luma-events.js` is now a debugging window rather than something the site needs — it is
the same data as JSON, so `curl babesnet.xyz/api/luma-events` tells you whether a wrong-looking
page is Luma's fault or ours. `lib/luma.js` is shared by it and the build script so there is
only ever one idea of what an event looks like.

It fetches both periods (Luma takes one at a time), trims each record to the ten fields a
card draws — about 2KB for 25 events instead of 90KB — and is cached at the edge for half an
hour. That cache is why `vercel.json` scopes its `no-store` rule to `/api/subscribe` rather
than all of `/api/*`.

Cards show the cover **square and uncropped**. Every Luma cover comes back 1:1 (2380x2380 or
1080x1080) and they are posters with text on them, so a wide frame cut the wording off.

They are also **resized before they reach the page**. Luma serves the original upload — PNGs
up to 9.6MB for a card drawn at 234px, 81MB across the 24 past events. `images.lumacdn.com`
runs Cloudflare Images, so the proxy rewrites each cover through it:

```
https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=scale-down,quality=75,width=480/<path>
```

`fit=scale-down` shrinks without cropping or padding (the card needs the whole square);
`format=auto` serves AVIF or WebP where the browser takes it. **81MB → 557KB.** Widths are
the rendered size doubled for retina: 480 for the past grid, 240 for the upcoming row.

`devserver.py` mirrors this endpoint locally so the JSON is there to look at without
`vercel dev`. The page itself no longer needs it — `/events` previews from its own HTML.
**Its trim and the one in `lib/luma.js` must stay in step** if you rely on the local JSON.

### Structured data

JSON-LD, one `<script type="application/ld+json">` per page:

| Page | Describes |
| --- | --- |
| `/` | `Organization` (+ `WebSite`) — name, logo, socials, the two founders |
| `/about` | `AboutPage`, and `Person` for Camilla and Florence |
| `/events` | one `Event` per **upcoming** event — generated, see above |

The founders are `@id`'d at `https://babesnet.xyz/about#camilla-parisotto` and
`…#florence-vuong`. The homepage's `Organization.founder` points at those ids rather than
repeating the names, so both pages describe one Camilla and one Florence.

**Those anchors are real.** Each founder's bio is its own `<p>` on `/about` carrying the
matching `id`, so the identifier resolves to the text it claims to identify. Rename one and
you have to rename it in the JSON-LD too. They are paragraphs rather than headings on
purpose — `/about` is a story, and an `<h2>` with a person's name in it would turn it into a
staff directory.

Dedicated founder pages at `/about/camilla-parisotto` were considered and **declined**: the
bios are two sentences each, two pages built from that would be thin, and LinkedIn will win
those name searches regardless. The half of that recommendation worth having — `Person` schema
with `sameAs` to their LinkedIn — is here. If the decision is ever reversed, the `@id` moves
with her; the point is that one person keeps one identifier.

Two deliberate omissions. **Past events are not marked up**: event rich results are for events
someone can still attend, and the past grid already reads as text. **A paid event gets no
`offers`** — Luma tells us an event is free but not what a paid one costs, and a guessed price
is worse than a missing one.

`/faq` has no `FAQPage` markup. That was a choice, not an oversight: Google restricted FAQ rich
results to health and government sites in 2023, so it would buy nothing there today. It is
still worth adding if the goal is answer engines rather than Google — it just wasn't part of
this pass.

### Alt text

Every image on `/` and `/about` carries alt text, with two deliberate exceptions on the
homepage. The Jupiter marquee icon sits next to a visible "Jupiter" label, and the Solana logo
is inside a link that already has `aria-label="Solana"` — describing either would make a screen
reader announce the same name twice. `alt=""` is the correct value in both cases, not a gap.

The gallery photos are described by what is *in* the frame, because each `<figure>` already has
a `<figcaption>` naming the event. Repeating "Babes Net Brunch in Cannes" in the alt of a photo
captioned "Babes Net Brunch in Cannes" would be noise.

Event covers on `/events` are `alt=""` for the same reason — the cover sits beside the event
name, which is already text and already the link.

### llms.txt

`/llms.txt` is a plain-text summary of the site for LLM crawlers — what Babes Net is, the
four pages worth reading, and where the events and socials live. It follows the
[llmstxt.org](https://llmstxt.org) convention: an H1, a blockquote summary, then `##` sections
of `[name](url): description` lines, with `## Optional` meaning "skip these if context is
tight."

Nothing in Google uses it and it may never be read. It costs a page of text.

Two rules if you edit it. **Every URL in it must resolve** — an llms.txt pointing at 404s is
worse than not having one, which is exactly why this was written after the redirects and not
before. And **it must not claim anything the site doesn't say**: the membership lines here are
taken from `/faq` (membership is free, you join with the form, no crypto experience needed),
not invented. It is written to be quoted by machines, so a wrong fact in it travels.

There is deliberately **no Blog section**, though the original recommendation included one.
There is no blog — `/blog` 301s to the homepage — and listing it would be the exact failure the
file is supposed to avoid. Add it when there is something at the other end.

### Redirects for the old site

`vercel.json` 301s a handful of paths that belong to the Webflow site this one replaced:

| Old URL | Goes to |
| --- | --- |
| `/about-us` | `/about` |
| `/events-cases`, `/events-cases/*` | `/events` |
| `/blog`, `/blog/*` | `/` (302, see below) |
| `/login` | `/` |

None of these ever existed in this repo, but they are still in Google's index and were
answering 404. A 404 throws away whatever standing the URL earned; a 301 hands it to the
page that replaced it.

They are written as `"statusCode": 301`, not `"permanent": true`. Vercel's `permanent` flag
emits a **308**, which Google does treat as a permanent redirect — but plenty of SEO tooling
still reports anything that isn't a literal 301 as a finding, and these are all GET-only
content URLs where the two behave identically. Not worth the argument.

**The two `/blog` rules are 302s, not 301s, and that is deliberate.** A blog is planned. A 301
is cached by browsers indefinitely, so anyone who hit `/blog` while it was dead would keep
being bounced to the homepage by their own cache long after the real blog shipped — and
nothing server-side can clear that. A 302 gives up some signal consolidation on a URL that has
no content to consolidate anyway. **When the blog lands, delete both rules.**

The other four are 301s: those pages are gone for good.

This list is only as complete as what turned up in a crawl. Search Console's coverage report
is where any other dead Webflow slug will surface, and the fix is another line here.

### Adding pages later

`vercel.json` sets `cleanUrls: true`, so `about.html` will serve at `/about`. Add new pages as
sibling HTML files and link them normally. If the site grows past a handful of pages, that's the
point to reconsider a static-site generator — but nothing here needs one yet.

---

## Links

- **Events calendar** → [lu.ma/babesnet](https://lu.ma/babesnet) (`cal-mqlFFooPRU3qIZi`)
- **Luma checkout script** → `embed.lu.ma/checkout-button.js`
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
