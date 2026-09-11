#!/usr/bin/env node
/* ---------------------------------------------------------------
   Babes Net — writing the event cards into events.html

   Run it, commit what it changes:

     node scripts/build-events.js

   /events used to build these cards in the browser. Visitors saw them;
   nothing else did. The markup only existed after a fetch to
   /api/luma-events, and robots.txt disallows /api/, so a crawler that
   rendered the page had that call refused and indexed the one line
   that was in the HTML: "Nothing on the calendar this minute." The
   site's only page of real, recurring content was, to a search engine,
   an empty page.

   So the cards are written here instead, into the file, ahead of time.
   Same markup the browser used to build, same classes, same Luma
   checkout hooks — it just ships already assembled.

   The trade is freshness: the page is as current as the last run of
   this script, not as current as Luma. For a calendar that gains an
   event every week or two that is a fair price for being readable by
   something that isn't a browser, and re-running it is one command.

   This is the only renderer. scripts.js no longer draws these cards —
   if you change the markup here, nothing else needs to agree with it.
   --------------------------------------------------------------- */

'use strict';

var fs = require('fs');
var path = require('path');
var luma = require('../lib/luma.js');

var PAGE = path.join(__dirname, '..', 'events.html');

/* Everything below goes into a file as markup, and every string with
   any interest in it — event names, city names, cover URLs — came from
   Luma. The browser version never had to think about this: it set
   .textContent and the DOM did the escaping. Writing HTML by hand
   means doing it by hand, on every value, without exception. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* A URL is about to become an href or a src. Escaping keeps it inside
   the quotes; this keeps it from being javascript: once it gets there.
   Luma has never sent anything but https — which is the point, because
   the day it does is the day this matters. */
function safeUrl(value) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? esc(value) : '';
}

/* Formatted in the event's own timezone — see the note in lib/luma.js.
   Node carries full ICU, so this is the same Intl the browser was
   using and the dates come out identical. */
function fmt(iso, tz, opts) {
  var date = new Date(iso);
  if (isNaN(date)) return '';

  opts.timeZone = tz || 'UTC';
  return new Intl.DateTimeFormat('en-GB', opts).format(date);
}

function when(iso, tz) {
  return fmt(iso, tz, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* "Wed 17 Sep · 18:00" — the day of the week earns its place on an
   upcoming event and is noise on one that already happened. */
function whenLong(iso, tz) {
  var day = fmt(iso, tz, { weekday: 'short', day: 'numeric', month: 'short' });
  var time = fmt(iso, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  return time ? day + ' · ' + time : day;
}

/* "Dubai · 54 went" — either half may be missing, and a lone separator
   looks like a bug, so the line is assembled from whatever is there. */
function meta(bits) {
  var kept = bits.filter(Boolean);
  return kept.length
    ? '<span class="pev__where">' + esc(kept.join(' · ')) + '</span>'
    : '';
}

/* The cover sits directly beside the event's name, which is already
   text on the card and already the link. Describing the poster here
   would make a screen reader read the same event twice, so the image
   is marked decorative on purpose — this is not a missing alt. */
function cover(item, className) {
  var src = safeUrl(item.cover);
  if (!src) return '';

  return '<span class="' + className + '">'
    + '<img src="' + src + '" alt="" loading="lazy" decoding="async">'
    + '</span>';
}

function upcomingCard(item) {
  var url = safeUrl(item.url);
  var shot = cover(item, 'uev__shot');
  var out = '';

  out += '<article class="uev">';

  if (shot) {
    out += '<a class="uev__shotlink" href="' + url + '" target="_blank" rel="noopener"'
        +  ' tabindex="-1" aria-hidden="true">' + shot + '</a>';
  }

  out += '<div class="uev__body">';
  out += '<b class="uev__when">' + esc(whenLong(item.start, item.tz)) + '</b>';
  out += '<h3 class="uev__title">'
      +  '<a class="uev__name" href="' + url + '" target="_blank" rel="noopener">'
      +  esc(item.name) + '</a></h3>';
  out += meta([item.city, item.free ? 'Free' : null]);
  out += '</div>';

  /* Sold out is a statement, not a button: Luma's modal would only
     tell them the same thing after a click. */
  if (item.soldOut) {
    out += '<span class="uev__full">Sold out</span>';
  } else {
    /* Luma's own hook. The <a> keeps a real href so it still works if
       their script is blocked or slow — the click just becomes a normal
       navigation to the event page instead of a modal. */
    out += '<a class="uev__cta" href="' + url + '"'
        +  ' data-luma-action="checkout" data-luma-event-id="' + esc(item.id) + '">Register</a>';
  }

  return out + '</article>';
}

function pastCard(item) {
  var url = safeUrl(item.url);
  var out = '';

  out += '<a class="pev" href="' + url + '" target="_blank" rel="noopener">';
  out += cover(item, 'pev__shot');
  out += '<b class="pev__date">' + esc(when(item.start, item.tz)) + '</b>';
  out += '<span class="pev__name">' + esc(item.name) + '</span>';
  out += meta([item.city, item.guests ? item.guests + ' went' : null]);

  return out + '</a>';
}

/* Event structured data, for the upcoming half only. A past event is not
   something anyone can attend, and Google's event results are for ones they
   can — the past grid earns its keep as readable text instead.

   Generated here rather than hand-written into the page for the obvious
   reason: schema describing events that aren't on the page is worse than no
   schema at all, and that is exactly what hand-maintaining this would drift
   into by the second or third calendar change. */
function renderSchema(items) {
  if (!items.length) return '';

  var ORG = 'https://babesnet.xyz/#organization';

  var events = items.map(function (item) {
    var event = {
      '@type': 'Event',
      name: item.name,
      startDate: item.start,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: item.online
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
      url: item.url,
      organizer: { '@id': ORG }
    };

    /* An online event's "place" is the page it happens on. A physical one
       needs an address, and a city is all Luma gives us — better than
       inventing a street. */
    event.location = item.online
      ? { '@type': 'VirtualLocation', url: item.url }
      : {
          '@type': 'Place',
          name: item.city || 'Venue announced on Luma',
          address: item.city
            ? { '@type': 'PostalAddress', addressLocality: item.city }
            : undefined
        };

    if (item.cover) event.image = item.cover;

    /* Only claimed when we actually know it. Luma tells us an event is free;
       it does not tell us what a paid one costs, and a guessed price is
       worse than a missing one. */
    if (item.free) {
      event.offers = {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: item.soldOut
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
        url: item.url
      };
    }

    return event;
  });

  var doc = { '@context': 'https://schema.org', '@graph': events };

  /* A "</script>" inside an event name would end the block early and spill
     the rest into the document. JSON has no opinion about that, so the
     angle bracket is escaped on the way out. */
  var json = JSON.stringify(doc, null, 2).replace(/</g, '\\u003c');

  return '<script type="application/ld+json">\n' + json + '\n</script>';
}

function indent(lines, pad) {
  return lines.map(function (line) { return pad + line; }).join('\n');
}

/* Both regions are written whole, wrapper and all, rather than having
   the cards dropped into a shell that is already in the file. The
   shell is what changes when the calendar empties out: no upcoming
   event means no list and a line of copy instead, no past event means
   the section is not there at all. One generated block per region is
   easier to be sure about than a handful of toggled `hidden`s. */
function renderUpcoming(items) {
  if (!items.length) {
    return '<p class="up__none">\n'
      + '  Nothing on the calendar this minute. Subscribe and you’ll know before it’s public.\n'
      + '</p>';
  }

  return '<div class="up">\n'
    + '  <div class="up__list">\n'
    + indent(items.map(upcomingCard), '    ') + '\n'
    + '  </div>\n'
    + '</div>';
}

function renderPast(items) {
  if (!items.length) return '';

  return '<section class="past wrap" id="past">\n'
    + '  <h2 class="past__title">Past Events</h2>\n'
    + '  <div class="past__grid">\n'
    + indent(items.map(pastCard), '    ') + '\n'
    + '  </div>\n'
    + '  <p class="past__all">\n'
    + '    <a class="past__link" href="https://lu.ma/babesnet?period=past" target="_blank" rel="noopener">All past events on Luma</a>\n'
    + '  </p>\n'
    + '</section>';
}

/* The markers are in events.html and they are load-bearing. Replacing
   between them rather than rewriting the file keeps the rest of the
   page hand-written and reviewable in a diff. */
function replaceRegion(html, name, body) {
  var open = '<!-- build:' + name + ' -->';
  var close = '<!-- /build:' + name + ' -->';

  var start = html.indexOf(open);
  var end = html.indexOf(close);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('events.html is missing the ' + open + ' ... ' + close + ' markers');
  }

  /* Whatever indentation the opening marker sits at is the indentation
     the generated block gets, so the file still reads as one document. */
  var lineStart = html.lastIndexOf('\n', start) + 1;
  var pad = html.slice(lineStart, start).replace(/[^\t ]/g, '');

  var block = body ? '\n' + indent(body.split('\n'), pad) + '\n' + pad : '\n' + pad;

  return html.slice(0, start + open.length) + block + html.slice(end);
}

async function main() {
  var data;

  try {
    data = await luma.fetchCalendar();
  } catch (err) {
    /* Loudly, and without touching the file. A failed fetch here means
       the calendar is unknown, not empty — writing an empty page on the
       strength of a network error would delete real content from the
       site and call it a build. */
    console.error('build-events: could not read Luma — ' + (err && err.message ? err.message : err));
    console.error('build-events: events.html left exactly as it was.');
    process.exit(1);
  }

  var before = fs.readFileSync(PAGE, 'utf8');
  var after = replaceRegion(before, 'upcoming', renderUpcoming(data.upcoming));
  after = replaceRegion(after, 'past', renderPast(data.past));
  after = replaceRegion(after, 'schema', renderSchema(data.upcoming));

  if (after === before) {
    console.log('build-events: no change (' + data.upcoming.length + ' upcoming, '
      + data.past.length + ' past)');
    return;
  }

  fs.writeFileSync(PAGE, after);
  console.log('build-events: wrote ' + data.upcoming.length + ' upcoming and '
    + data.past.length + ' past events into events.html');
}

main();
