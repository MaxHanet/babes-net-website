/* ---------------------------------------------------------------
   Babes Net — behaviour
   Four independent pieces: the logo marquee, the hero video toggle,
   the two photo rails, and the map reveal. Each guards its own DOM
   so a missing section never breaks the others.
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- marquee -------------------------------------------------
     The CSS animation travels -50%, which only lines up seamlessly
     if the track holds exactly two identical rows. */

  (function marquee() {
    var track = document.querySelector('[data-marquee]');
    if (!track || reduced) return;

    var row = track.querySelector('.marquee__row');
    if (!row) return;

    var clone = row.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('img').forEach(function (img) { img.alt = ''; });
    clone.querySelectorAll('a').forEach(function (a) { a.tabIndex = -1; });
    track.appendChild(clone);
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
})();
