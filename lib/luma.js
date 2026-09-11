/* ---------------------------------------------------------------
   Babes Net — reading the Luma calendar

   One implementation of "what is on the calendar", shared by the two
   things that ask:

     scripts/build-events.js   at build time, to write the cards into
                               events.html as real HTML
     api/luma-events.js        at runtime, for anyone who wants the
                               same data as JSON

   The build script is the one the site depends on. /events used to
   draw its own cards in the browser from that endpoint, which worked
   for visitors and for nobody else: the markup existed only after the
   fetch, and robots.txt disallows /api/, so a crawler rendering the
   page had the call refused and indexed the empty state. The cards are
   generated ahead of time now and ship in the HTML.

   This is a proxy, not a mirror. It exists for two reasons:

     1. api.lu.ma sends no CORS headers, so a browser cannot call it.
     2. It lets us keep a small, stable shape instead of Luma's full
        record — about 2KB for 24 events rather than 90KB.

   ⚠ The upstream endpoint is the one luma.com's own front end calls.
   It is public and needs no key, but it is NOT Luma's documented API
   (that one wants a Luma Plus key). It can change without notice, so
   every caller here is expected to treat an empty list as a normal
   answer. A quiet gap beats a broken grid.
   --------------------------------------------------------------- */

'use strict';

var CALENDAR = 'cal-mqlFFooPRU3qIZi';        /* lu.ma/babesnet */
var UPSTREAM = 'https://api.lu.ma/calendar/get-items';
var LIMIT = 40;                               /* 24 today; room to grow */
var TIMEOUT_MS = 6000;

/* Luma returns the address in the venue's own locale, so three Dubai
   events come back as "دبي". Everything else on this site is English;
   this is the whole translation table and it is expected to stay that
   size. */
var CITY_ALIAS = { 'دبي': 'Dubai' };

function cityOf(event) {
  if (event.location_type !== 'offline') return 'Online';

  var geo = event.geo_address_info;
  if (!geo) return '';

  var city = geo.city || geo.region || '';
  if (CITY_ALIAS[city]) city = CITY_ALIAS[city];

  /* A city nobody outside it would place is worth a country; New York
     and Berlin are not. Falling back to the country alone is better
     than a blank when the city is in a script we didn't alias. */
  if (!city) return geo.country || '';
  return city;
}

/* Luma hands out the cover at whatever size it was uploaded — 2380x2380
   PNGs, up to 9.6MB each, for a card drawn at 234px. Twenty-four of those
   is 81MB of page.

   images.lumacdn.com runs Cloudflare Images, so a resize is a path away:
   /cdn-cgi/image/<options>/<original path>. `fit=scale-down` shrinks
   without cropping or padding, which is what the square-and-uncropped
   card needs; `format=auto` serves AVIF or WebP to browsers that take
   them. The same 9.6MB cover comes back at 28KB.

   A cover from anywhere else is passed through untouched rather than
   guessed at. */
var CDN = 'https://images.lumacdn.com/';

function thumb(url, width) {
  if (!url || url.indexOf(CDN) !== 0) return url;

  var opts = 'format=auto,fit=scale-down,quality=75,width=' + width;
  return CDN + 'cdn-cgi/image/' + opts + '/' + url.slice(CDN.length);
}

/* Only what the card draws. Anything else Luma sends — guest emails,
   ticket types, Stripe account ids — has no business leaving here. */
function trim(entry, coverWidth) {
  var event = entry && entry.event;
  if (!event || event.visibility !== 'public' || !event.url) return null;

  return {
    id: event.api_id,
    name: event.name,
    url: 'https://lu.ma/' + event.url,
    start: event.start_at,
    /* The date a card shows is the date the event happened where it
       happened. Formatting the UTC instant in the reader's own zone
       would slide an 18:00 Dubai brunch onto the wrong day for anyone
       west of it. */
    tz: event.timezone || 'UTC',
    city: cityOf(event),
    online: event.location_type !== 'offline',
    cover: thumb(event.cover_url, coverWidth) || null,
    guests: typeof entry.guest_count === 'number' ? entry.guest_count : null,
    /* Upcoming cards say "Free" or a price and flag a sold-out event, so
       the button never promises a seat that isn't there. */
    free: !!(entry.ticket_info && entry.ticket_info.is_free),
    soldOut: !!(entry.ticket_info && entry.ticket_info.is_sold_out)
  };
}

/* Rendered width x2 for retina, rounded up: the past grid draws at 234
   (160 two-up on a phone), the upcoming row at 96. */
var COVER_WIDTH = { future: 240, past: 480 };

function fetchPeriod(period) {
  var url = UPSTREAM
    + '?calendar_api_id=' + encodeURIComponent(CALENDAR)
    + '&period=' + period
    + '&pagination_limit=' + LIMIT;

  /* Node's fetch has no default timeout, and a hung upstream would sit
     on the caller until something else kills it. */
  var abort = new AbortController();
  var timer = setTimeout(function () { abort.abort(); }, TIMEOUT_MS);

  return fetch(url, {
    signal: abort.signal,
    /* Named on purpose. Luma is answering a request it never agreed to
       serve us, so the least we can do is be identifiable in their logs
       rather than hiding behind the runtime's default. */
    headers: {
      accept: 'application/json',
      'user-agent': 'babesnet.xyz (+https://babesnet.xyz/events)'
    }
  }).then(function (r) {
    if (!r.ok) throw new Error('luma responded ' + r.status);
    return r.json();
  }).then(function (data) {
    var entries = (data && data.entries) || [];
    var width = COVER_WIDTH[period] || 480;
    return entries.map(function (entry) { return trim(entry, width); }).filter(Boolean);
  }).finally(function () {
    clearTimeout(timer);
  });
}

/* Two calls, in parallel: Luma's endpoint takes one period at a time.
   Both must land — a page showing past events and silently omitting an
   upcoming one would be worse than showing neither. */
function fetchCalendar() {
  return Promise.all([fetchPeriod('future'), fetchPeriod('past')])
    .then(function (both) {
      return { upcoming: both[0], past: both[1] };
    });
}

module.exports = { fetchCalendar: fetchCalendar };
