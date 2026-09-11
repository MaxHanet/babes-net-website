/* ---------------------------------------------------------------
   Babes Net — behaviour
   Independent pieces: the logo marquee, the hero video toggle, the two
   photo rails, the map reveal, the email pop-up, and the two event
   lists on /events. Each guards its own DOM so a missing section never
   breaks the others.
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- marquee -------------------------------------------------
     The animation slides the track left by exactly one row and loops, so
     the seam is invisible only while the rows behind the one that left
     still cover the screen. Two rows did that up to about 2300px and then
     stopped: on anything wider the trailing edge ran dry once a cycle and
     the logos appeared to blink out. So the row is tiled to the viewport
     rather than duplicated once, and the travel distance is measured
     instead of assumed. */

  (function marquee() {
    var track = document.querySelector('[data-marquee]');
    if (!track || reduced) return;

    var row = track.querySelector('.marquee__row');
    if (!row) return;

    /* copies are decoration: the original row already carries the alt text
       and the real tab stops */
    var addRow = function () {
      var clone = row.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('img').forEach(function (img) { img.alt = ''; });
      clone.querySelectorAll('a').forEach(function (a) { a.tabIndex = -1; });
      track.appendChild(clone);
    };

    var step = 0;

    var layout = function () {
      var width = row.getBoundingClientRect().width;
      if (!width) return;                       /* not laid out yet */

      /* one row leaves + the rest must still fill the frame, so the track
         has to be at least the viewport plus the row that is on its way out */
      var needed = track.parentElement.getBoundingClientRect().width + width;
      var guard = 24;                           /* fonts/images can only shrink it so far */
      while (track.getBoundingClientRect().width < needed && guard--) addRow();

      if (Math.abs(width - step) < 0.5) return; /* same as last time, leave the loop alone */
      step = width;
      track.style.setProperty('--step', width + 'px');
      track.classList.add('is-running');
    };

    layout();

    /* a drag-resize fires continuously and each layout() reflows a track
       several thousand pixels wide, so settle first */
    var pending = null;
    var relayout = function () {
      clearTimeout(pending);
      pending = setTimeout(layout, 150);
    };

    /* The row is sized in viewport units and the wordmark waits on a webfont,
       so its width is not final at first paint. Watching the row itself picks
       up the font swap, a resize and a zoom alike; the window listener is only
       there for browsers without ResizeObserver. */
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(row);
    else window.addEventListener('resize', relayout);

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
  })();

  /* --- mobile nav drawer ---------------------------------------
     One drawer per page, opened by the hamburger and closed by the X,
     the scrim, Escape, following a link, or growing past the phone
     breakpoint. The open state is a class on <html> so the CSS can
     also lock the page behind it. */

  (function navDrawer() {
    var burger = document.querySelector('[data-nav-open]');
    var close = document.querySelector('[data-nav-close]');
    var scrim = document.querySelector('[data-nav-scrim]');
    var menu = document.getElementById('nav-menu');
    if (!burger || !menu) return;

    var root = document.documentElement;
    var wide = window.matchMedia('(min-width: 768px)');

    var setOpen = function (open) {
      root.classList.toggle('nav-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      /* preventScroll matters: at this instant the drawer is still parked at
         translateX(100%), so a plain focus() makes the browser scroll the
         page sideways chasing it and the drawer never appears */
      if (open && close) close.focus({ preventScroll: true });
      else if (!open) burger.focus({ preventScroll: true });
    };

    burger.addEventListener('click', function () {
      setOpen(!root.classList.contains('nav-open'));
    });

    if (close) close.addEventListener('click', function () { setOpen(false); });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });

    /* only when the drawer is actually open: on desktop these same links
       sit in the bar and must not touch focus */
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (root.classList.contains('nav-open')) setOpen(false);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('nav-open')) setOpen(false);
    });

    /* rotating to landscape can cross the breakpoint; leaving the class on
       would keep the page scroll-locked with no drawer in sight */
    var onWide = function () {
      if (wide.matches) root.classList.remove('nav-open');
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  })();

  /* --- hero video toggle --------------------------------------- */

  (function heroVideo() {
    var video = document.querySelector('.hero__video');
    var toggle = document.querySelector('.hero__toggle');
    if (!video || !toggle) return;

    var sync = function () {
      var paused = video.paused;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
    };

    toggle.addEventListener('click', function () {
      if (video.paused) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        video.pause();
      }
      sync();
    });

    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    sync();

    /* --- adapt the overlay to the frame behind it ------------------
       The hero video changes brightness as it runs, so fixed white text
       can vanish against a light frame. Rather than hard-code timestamps,
       sample the frame itself: a tiny canvas, four times a second, only
       while the video is actually playing. So it survives a recut. */

    var media = document.querySelector('.hero__media');
    if (!media || !video.canPlayType) return;

    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    var LIGHT = 186;      /* mean luma above which the frame counts as light */
    var HYST = 12;        /* dead band, so a mid-tone frame can't strobe */
    var isLight = false;
    var timer = null;

    var sample = function () {
      if (video.paused || video.readyState < 2) return;
      try {
        /* sample only the top band, where the headline and CTA actually sit —
           averaging the whole frame let a dark-edged but pale-centred shot
           read as 'dark' and keep unreadable white text */
        ctx.drawImage(video,
          0, 0, video.videoWidth, video.videoHeight * 0.45,
          0, 0, canvas.width, canvas.height);
        var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        var sum = 0;
        for (var i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        }
        var luma = sum / (d.length / 4);
        if (!isLight && luma > LIGHT + HYST) { isLight = true; media.classList.add('is-light'); }
        else if (isLight && luma < LIGHT - HYST) { isLight = false; media.classList.remove('is-light'); }
      } catch (e) {
        /* a tainted canvas would throw; stop sampling rather than spin */
        clearInterval(timer);
      }
    };

    var start = function () { if (!timer) timer = setInterval(sample, 250); };
    var stop = function () { clearInterval(timer); timer = null; };

    video.addEventListener('play', start);
    video.addEventListener('pause', stop);
    video.addEventListener('loadeddata', sample);
    if (!video.paused) start();

    /* don't burn cycles while the hero is scrolled out of view */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !video.paused) start(); else stop();
        });
      }, { threshold: 0 }).observe(media);
    }
  })();

  /* --- carousel videos ----------------------------------------
     No autoplay attribute: these start only once scrolled into view, so
     they cost nothing on first load and pause when they leave. Silent by
     design — the encodes carry no audio track at all. */

  (function railVideos() {
    var vids = [].slice.call(document.querySelectorAll('.slide video'));
    if (!vids.length) return;

    var play = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); };

    if (reduced || !('IntersectionObserver' in window)) {
      vids.forEach(play);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) play(e.target); else e.target.pause();
      });
    }, { threshold: 0.2 });

    vids.forEach(function (v) { io.observe(v); });
  })();

  /* --- photo rails ---------------------------------------------
     Drag to pan, arrows to step. Pointer capture keeps the drag
     alive when the cursor leaves the track mid-swipe. */

  document.querySelectorAll('[data-rail]').forEach(function (rail) {
    var track = rail.querySelector('[data-rail-track]');
    if (!track) return;

    var prev = rail.querySelector('.rail__nav--prev');
    var next = rail.querySelector('.rail__nav--next');

    var updateArrows = function () {
      var max = track.scrollWidth - track.clientWidth;
      if (prev) prev.disabled = track.scrollLeft <= 1;
      if (next) next.disabled = track.scrollLeft >= max - 1;
    };

    rail.querySelectorAll('.rail__nav').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.dataset.dir) || 1;
        track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
      });
    });

    var startX = 0, startScroll = 0, dragging = false, moved = 0;

    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      track.scrollLeft = startScroll - dx;
      if (moved > 4) e.preventDefault();
    });

    var endDrag = function (e) {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      if (e && e.pointerId != null && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
    };

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    /* swallow the click that follows a real drag */
    track.addEventListener('click', function (e) {
      if (moved > 4) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    track.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    updateArrows();
  });

  /* --- faq accordion ------------------------------------------- */

  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });

  /* --- map reveal ----------------------------------------------
     Photo first, then the hearts bloom, then the city names. The
     stagger index for each name is set here so CSS can fan them out. */

  (function map() {
    var map = document.querySelector('[data-map]');
    if (!map) return;

    map.querySelectorAll('.map__cities').forEach(function (list, listIndex) {
      Array.prototype.forEach.call(list.children, function (li, i) {
        li.style.setProperty('--ci', String(listIndex * 2 + i));
      });
    });

    if (reduced || !('IntersectionObserver' in window)) {
      map.classList.add('is-in');
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        map.classList.add('is-in');
        io.disconnect();
      });
    }, { threshold: 0.25 });

    io.observe(map);
  })();

  /* --- events page --------------------------------------------
     Only on /events, and the whole page's data comes from one call.

     Upcoming and past are drawn from the same JSON but read differently
     on purpose: upcoming is a short list with a live Register button,
     past is a quiet gallery of covers.

     Registration is not ours and never touches this file's DOM: each
     Register button carries Luma's own `data-luma-action="checkout"`
     hook, and Luma's script opens their modal over the page. That is
     the official integration — we draw the list, they take the RSVP. */

  (function eventsPage() {
    var upWrap = document.querySelector('[data-up]');
    var upList = document.querySelector('[data-up-list]');
    var upNone = document.querySelector('[data-up-none]');
    var pastWrap = document.querySelector('[data-past]');
    var pastGrid = document.querySelector('[data-past-grid]');
    if (!upList && !pastGrid) return;

    var CHECKOUT_SRC = 'https://embed.lu.ma/checkout-button.js';

    /* Names and cities come from Luma, so every one of them is set as
       text, never as markup. el() exists to make that the only option
       available here. */
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /* Formatted in the event's own timezone — see the note in
       api/luma-events.js. Intl does the work where it can; the manual
       fallback is UTC, which is off by at most a day on a browser old
       enough not to have timeZone support. */
    function fmt(iso, tz, opts) {
      var date = new Date(iso);
      if (isNaN(date)) return '';

      try {
        opts.timeZone = tz;
        return new Intl.DateTimeFormat('en-GB', opts).format(date);
      } catch (e) {
        return date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
      }
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

    function cover(item, className) {
      if (!item.cover) return null;

      var shot = el('span', className);
      var img = el('img');
      img.src = item.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      /* A cover that 404s leaves a broken-image glyph in the middle of
         the grid; dropping the frame entirely is tidier. */
      img.addEventListener('error', function () { shot.remove(); });
      shot.appendChild(img);
      return shot;
    }

    /* "Dubai · 54 went" — either half may be missing, and a lone
       separator looks like a bug, so the line is assembled from
       whatever is actually there. */
    function meta(bits) {
      var kept = bits.filter(Boolean);
      return kept.length ? el('span', 'pev__where', kept.join(' · ')) : null;
    }

    function pastCard(item) {
      var link = el('a', 'pev');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener';

      var shot = cover(item, 'pev__shot');
      if (shot) link.appendChild(shot);

      link.appendChild(el('b', 'pev__date', when(item.start, item.tz)));
      link.appendChild(el('span', 'pev__name', item.name));

      var line = meta([item.city, item.guests ? item.guests + ' went' : null]);
      if (line) link.appendChild(line);

      return link;
    }

    function upcomingCard(item) {
      var row = el('article', 'uev');

      var shot = cover(item, 'uev__shot');
      if (shot) {
        var shotLink = el('a', 'uev__shotlink');
        shotLink.href = item.url;
        shotLink.target = '_blank';
        shotLink.rel = 'noopener';
        shotLink.setAttribute('tabindex', '-1');
        shotLink.setAttribute('aria-hidden', 'true');
        shotLink.appendChild(shot);
        row.appendChild(shotLink);
      }

      var body = el('div', 'uev__body');
      body.appendChild(el('b', 'uev__when', whenLong(item.start, item.tz)));

      var title = el('a', 'uev__name', item.name);
      title.href = item.url;
      title.target = '_blank';
      title.rel = 'noopener';

      var heading = el('h3', 'uev__title');
      heading.appendChild(title);
      body.appendChild(heading);

      var line = meta([item.city, item.free ? 'Free' : null]);
      if (line) body.appendChild(line);
      row.appendChild(body);

      /* Sold out is a statement, not a button: Luma's modal would only
         tell them the same thing after a click. */
      if (item.soldOut) {
        row.appendChild(el('span', 'uev__full', 'Sold out'));
        return row;
      }

      /* Luma's own hook. The <a> keeps a real href so it still works if
         their script is blocked or slow — the click just becomes a
         normal navigation to the event page instead of a modal. */
      var cta = el('a', 'uev__cta', 'Register');
      cta.href = item.url;
      cta.setAttribute('data-luma-action', 'checkout');
      cta.setAttribute('data-luma-event-id', item.id);
      row.appendChild(cta);

      return row;
    }

    /* Luma's script binds its handlers once, on load. Our buttons don't
       exist yet at that point, so it is loaded after the list is built
       and re-armed by hand if it was already on the page. */
    function armCheckout() {
      if (window.luma && window.luma.initCheckout) {
        window.luma.initCheckout();
        return;
      }
      if (document.getElementById('luma-checkout')) return;

      var script = document.createElement('script');
      script.id = 'luma-checkout';       /* their script reads its own id */
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    function fill(grid, items, build) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < items.length; i++) frag.appendChild(build(items[i]));
      grid.appendChild(frag);
    }

    fetch('/api/luma-events', { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (data) {
        var upcoming = (data && data.upcoming) || [];
        var past = (data && data.past) || [];

        if (upList && upcoming.length) {
          fill(upList, upcoming, upcomingCard);
          upWrap.hidden = false;
          armCheckout();
        } else if (upNone) {
          upNone.hidden = false;
        }

        if (pastGrid && past.length) {
          fill(pastGrid, past, pastCard);
          pastWrap.hidden = false;
        }
      })
      .catch(function () {
        /* Both sections stay hidden — except the one line that is true
           whatever went wrong: there is nothing to show right now. */
        if (upNone) upNone.hidden = false;
      });
  })();

  /* --- email pop-up --------------------------------------------
     Built from Figma "Email Pop Up 1 / 2 - Desktop". The two frames
     differ only in the photo, so the pop-up alternates between them —
     a second visit gets the one the first visit didn't.

     The markup is built here rather than written into the three page
     files. It is inert without JS, so a no-script visitor loses nothing
     by its absence, and one template beats three copies of a forty-line
     block drifting apart. */

  (function emailPopup() {
    var DONE = 'babes:pop:done';       /* subscribed — never ask again */
    var SNOOZE = 'babes:pop:snooze';   /* dismissed — timestamp */
    var SEEN = 'babes:pop:seen';       /* which photo was last shown */

    var SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
    var DELAY_MS = 8000;
    var SCROLL_AT = 0.4;

    /* Safari in private mode throws on read as well as write, so every
       access goes through these rather than a feature test. */
    var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var write = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

    if (read(DONE)) return;
    var snoozed = Number(read(SNOOZE));
    if (snoozed && Date.now() - snoozed < SNOOZE_MS) return;

    var root = document.documentElement;
    var narrow = window.matchMedia('(max-width: 767px)');

    var last = read(SEEN);
    var variant = last === '1' ? '2' : last === '2' ? '1' : (Math.random() < 0.5 ? '1' : '2');

    var PHOTOS = {
      '1': { portrait: 'assets/popup/p1-portrait.webp', wide: 'assets/popup/p1-wide.webp' },
      '2': { portrait: 'assets/popup/p2-portrait.webp', wide: 'assets/popup/p2-wide.webp' }
    };

    var scrim = document.createElement('div');
    scrim.className = 'pop__scrim';

    var pop = document.createElement('div');
    pop.className = 'pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-labelledby', 'pop-title');
    pop.innerHTML =
      '<button class="pop__close" type="button" aria-label="Close"></button>' +
      '<div class="pop__photo"><img alt="" decoding="async"></div>' +
      '<div class="pop__body">' +
        '<h2 class="pop__title" id="pop-title">Hi Babe, subscribe &lt;3</h2>' +
        '<p class="pop__sub">Stay in the loop with all things Babes Net</p>' +
        '<form class="pop__form" novalidate>' +
          '<input class="pop__input" type="email" name="email" placeholder="Email Address"' +
                ' autocomplete="email" required aria-label="Email address">' +
          /* the honeypot: never shown, never announced, never tabbed to —
             anything that fills it in is not a person */
          '<input class="pop__hp" type="text" name="company" tabindex="-1"' +
                ' autocomplete="off" aria-hidden="true">' +
          '<button class="pop__btn" type="submit">Subscribe</button>' +
        '</form>' +
        '<p class="pop__error" role="alert" hidden></p>' +
        '<p class="pop__thanks" role="status" hidden>You’re on the list.</p>' +
      '</div>' +
      /* the consent sentence is the design's, verbatim — the policy link is
         appended rather than folded into it, so the thing being consented
         to still reads as a plain statement */
      '<p class="pop__fine">by subscribing, you agree to receiving emails from us' +
        ' · <a href="/privacy" aria-label="Privacy policy">privacy</a></p>';

    var img = pop.querySelector('.pop__photo img');
    var title = pop.querySelector('.pop__title');
    var sub = pop.querySelector('.pop__sub');
    var form = pop.querySelector('.pop__form');
    var input = pop.querySelector('.pop__input');
    var hp = pop.querySelector('.pop__hp');
    var btn = pop.querySelector('.pop__btn');
    var error = pop.querySelector('.pop__error');
    var thanks = pop.querySelector('.pop__thanks');
    var closeBtn = pop.querySelector('.pop__close');
    var fine = pop.querySelector('.pop__fine');

    /* In the DOM from the start, so the open transition has something to
       animate from. `visibility: hidden` keeps it out of the tab order —
       but only once the closing transition has finished, and a tab that
       gets backgrounded mid-close suspends that transition indefinitely.
       `inert` is the belt to that braces: it doesn't wait for anything. */
    pop.inert = true;
    document.body.appendChild(scrim);
    document.body.appendChild(pop);

    var openedAt = 0;
    var lastFocus = null;
    var armed = true;
    var timer = null;

    var disarm = function () {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseout', onExit);
    };

    var show = function () {
      /* never stack two overlays — the drawer owns the screen while it's open */
      if (!armed || root.classList.contains('nav-open')) return;
      armed = false;
      disarm();

      /* the source is set only now, and only for the crop this viewport
         will use, so a pop-up nobody sees costs nothing to download */
      img.src = narrow.matches ? PHOTOS[variant].wide : PHOTOS[variant].portrait;
      write(SEEN, variant);

      lastFocus = document.activeElement;
      pop.inert = false;
      root.classList.add('pop-open');
      openedAt = Date.now();
      input.focus({ preventScroll: true });
    };

    var close = function () {
      if (!root.classList.contains('pop-open')) return;
      root.classList.remove('pop-open');
      pop.inert = true;
      /* a dismissal snoozes; a subscription has already set DONE */
      if (!read(DONE)) write(SNOOZE, String(Date.now()));
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };

    function onScroll() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= SCROLL_AT) show();
    }

    /* no relatedTarget means the cursor left the document itself rather
       than moving between two elements inside it */
    function onExit(e) {
      if (e.clientY <= 0 && !e.relatedTarget) show();
    }

    timer = setTimeout(show, DELAY_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    if (!narrow.matches) document.addEventListener('mouseout', onExit);

    closeBtn.addEventListener('click', close);
    scrim.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    /* keep Tab inside the card while it is open */
    pop.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var stops = [].slice.call(pop.querySelectorAll('button, input:not(.pop__hp)'))
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!stops.length) return;
      var first = stops[0];
      var lastStop = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastStop.focus();
      } else if (!e.shiftKey && document.activeElement === lastStop) {
        e.preventDefault();
        first.focus();
      }
    });

    var fail = function (message) {
      error.textContent = message;
      error.hidden = false;
    };

    var succeed = function () {
      write(DONE, '1');
      title.textContent = 'Thank you, babe';
      sub.hidden = true;
      form.hidden = true;
      fine.hidden = true;
      error.hidden = true;
      thanks.hidden = false;
      closeBtn.focus({ preventScroll: true });
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var value = input.value.trim();
      /* deliberately loose — the server is the authority on what counts
         as an address, this only catches the obvious typo before a round trip */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        fail('That address doesn’t look right.');
        input.focus();
        return;
      }

      btn.disabled = true;
      error.hidden = true;

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          company: hp.value,
          t: Date.now() - openedAt
        })
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then(succeed).catch(function () {
        btn.disabled = false;
        fail('Something went wrong. Try again in a moment.');
      });
    });
  })();
})();
