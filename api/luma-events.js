/* ---------------------------------------------------------------
   Babes Net — the /events page's data, read from Luma

   Both halves of /events — upcoming and past — are drawn by us from
   the JSON below, and registration is handed back to Luma's official
   checkout button (see scripts.js).

   The calendar *embed* was the obvious way to do the upcoming half and
   it is the reason this file grew a second list. That embed is an
   iframe that never posts its height, so its box is a fixed guess: too
   tall for one event, too short for ten. Nothing in the embed's API
   fixes that — there is no resize message and no auto-height. Drawing
   the cards ourselves sizes them to whatever is actually on the
   calendar, and costs nothing we weren't already fetching.

   This is a proxy, not a mirror. It exists for two reasons:

     1. api.lu.ma sends no CORS headers, so the page cannot call it
        directly from the browser.
     2. It lets us hand the page a small, stable shape instead of
        Luma's full record — about 2KB for 24 events rather than 90KB.

   ⚠ The upstream endpoint is the one luma.com's own front end calls.
   It is public and needs no key, but it is NOT Luma's documented API
   (that one wants a Luma Plus key). It can change without notice, so
   every failure here answers 200 with an empty list and the page
   simply drops the section. A quiet gap beats a broken grid.
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
   ticket types, Stripe account ids — has no business leaving this
   function. */
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
     on the function until the platform kills it. */
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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ upcoming: [], past: [] });
  }

  try {
    /* Two calls, in parallel: Luma's endpoint takes one period at a
       time. Both must land — a page showing past events and silently
       omitting an upcoming one would be worse than showing neither. */
    var both = await Promise.all([fetchPeriod('future'), fetchPeriod('past')]);

    /* Half an hour fresh, a day stale-while-revalidate: a past event is
       past. The visitor never waits on Luma, and Luma sees one request
       per half hour per region rather than one per pageview. */
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ upcoming: both[0], past: both[1] });
  } catch (err) {
    console.error('luma-events: ' + (err && err.message ? err.message : err));

    /* Still 200, still cacheable — briefly. The page reads an empty list
       as "nothing to show" and hides the section, which is the right
       thing to render whether Luma is down or the calendar is empty. */
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({ upcoming: [], past: [] });
  }
};
