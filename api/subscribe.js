/* ---------------------------------------------------------------
   Babes Net — newsletter signup
   The one server-side thing on this site. Takes an address from the
   pop-up and adds it to a Resend Audience. Plain CommonJS, no
   dependencies: Vercel's zero-config Node runtime picks up /api/*.js
   on a static project, and `fetch` is global on Node 18+.

   Two secrets, set in Vercel and nowhere else — this repo is public:
     RESEND_API_KEY
     RESEND_AUDIENCE_ID

   Note that this endpoint never sends mail. That is deliberate, not a
   shortcut: an endpoint that emails whatever address it is handed is a
   mail cannon pointed at strangers' inboxes. The confirmation the
   visitor sees is drawn in the pop-up instead.
   --------------------------------------------------------------- */

'use strict';

var MAX_BODY = 2048;              /* bytes — an address is ~30 of them */
var MIN_DWELL_MS = 1500;          /* nobody reads and types faster than this */
var MAX_DWELL_MS = 60 * 60 * 1000;
var RATE_MAX = 5;                 /* submissions per IP ... */
var RATE_WINDOW_MS = 10 * 60 * 1000;   /* ... per this long */

var ALLOWED_HOSTS = [
  'babesnet.xyz',
  'www.babesnet.xyz',
  'localhost',
  '127.0.0.1'
];

/* Short on purpose. A list of every throwaway domain in existence is a
   list nobody maintains; these are the ones that actually show up. */
var DISPOSABLE = [
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com',
  'yopmail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com',
  'throwawaymail.com', 'getnada.com', 'maildrop.cc', 'fakeinbox.com',
  'dispostable.com', 'mailnesia.com', 'discard.email', 'spam4.me'
];

/* Best effort only. Fluid Compute reuses instances, so in practice this
   catches a lot — but counters are per instance and per region, so it is
   not a guarantee. The real fix, if abuse ever shows up, is a Vercel
   Firewall rate-limit rule on POST /api/subscribe: no code change. */
var hits = new Map();

function throttled(ip) {
  var now = Date.now();
  var seen = (hits.get(ip) || []).filter(function (t) { return now - t < RATE_WINDOW_MS; });
  seen.push(now);
  hits.set(ip, seen);

  /* keep the map from growing without bound on a long-lived instance */
  if (hits.size > 5000) {
    for (var key of hits.keys()) {
      if (hits.size <= 2500) break;
      hits.delete(key);
    }
  }

  return seen.length > RATE_MAX;
}

function clientIp(req) {
  var fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
}

/* Origin is absent on some same-origin posts, so Referer is the fallback.
   Previews are *.vercel.app and have to keep working. */
function originAllowed(req) {
  var source = req.headers.origin || req.headers.referer;
  if (!source) return false;
  try {
    var host = new URL(source).hostname;
    return ALLOWED_HOSTS.indexOf(host) !== -1 || /\.vercel\.app$/.test(host);
  } catch (e) {
    return false;
  }
}

function readBody(req) {
  /* Vercel's Node helpers parse application/json for us and consume the
     stream doing it, so prefer what they left behind. */
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); }
  }

  return new Promise(function (resolve) {
    var chunks = '';
    var over = false;
    req.on('data', function (c) {
      if (over) return;
      chunks += c;
      if (chunks.length > MAX_BODY) { over = true; resolve(null); }
    });
    req.on('end', function () {
      if (over) return;
      try { resolve(JSON.parse(chunks || '{}')); } catch (e) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

function validEmail(value) {
  if (typeof value !== 'string') return null;

  var email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;

  var parts = email.split('@');
  if (parts.length !== 2) return null;

  var local = parts[0];
  var domain = parts[1];

  if (!local || local.length > 64) return null;
  if (domain.indexOf('.') === -1) return null;
  if (/^\.|\.$|\.\./.test(local) || /^\.|\.$|\.\.|^-|-$/.test(domain)) return null;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (DISPOSABLE.indexOf(domain) !== -1) return null;

  return email;
}

function addToAudience(email) {
  var key = process.env.RESEND_API_KEY;
  var audience = process.env.RESEND_AUDIENCE_ID;

  /* Missing config is our mistake, and it is not survivable: telling
     someone "thank you" while dropping their address on the floor is
     worse than telling them it didn't work. Kept distinct from a Resend
     hiccup, which is worth swallowing. */
  if (!key || !audience) {
    console.error('subscribe: RESEND_API_KEY or RESEND_AUDIENCE_ID is not set');
    return Promise.resolve('unconfigured');
  }

  return fetch('https://api.resend.com/audiences/' + audience + '/contacts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: email, unsubscribed: false })
  }).then(function (r) {
    if (r.ok) return 'ok';
    return r.text().then(function (body) {
      /* somebody subscribing twice is not an error worth surfacing */
      if (r.status === 409 || /already exists/i.test(body)) return 'ok';
      console.error('subscribe: resend responded ' + r.status + ' ' + body);
      return 'failed';
    });
  }).catch(function (err) {
    console.error('subscribe: resend request failed', err);
    return 'failed';
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  if (!originAllowed(req)) return res.status(403).json({ ok: false });

  var type = String(req.headers['content-type'] || '');
  if (type.indexOf('application/json') === -1) return res.status(415).json({ ok: false });

  var declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY) return res.status(413).json({ ok: false });

  if (throttled(clientIp(req))) return res.status(429).json({ ok: false });

  var body = await readBody(req);
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false });

  /* The honeypot is never shown, never announced and never tabbed to, so
     a value in it means an automated fill. Answer exactly as a success
     would, and do nothing — a bot that can tell it failed will adapt. */
  if (body.company) return res.status(200).json({ ok: true });

  var dwell = Number(body.t);
  if (!isFinite(dwell) || dwell < MIN_DWELL_MS || dwell > MAX_DWELL_MS) {
    return res.status(200).json({ ok: true });
  }

  var email = validEmail(body.email);
  if (!email) return res.status(400).json({ ok: false });

  var outcome = await addToAudience(email);

  /* The one failure worth admitting to: with no credentials the address
     is going nowhere, and the pop-up should say so rather than thank
     someone for a subscription that didn't happen. */
  if (outcome === 'unconfigured') return res.status(503).json({ ok: false });

  /* Otherwise always the same answer. It never leaks whether an address
     was already on the list, and a Resend outage is our problem to read
     in the logs, not something to show someone who typed correctly. */
  return res.status(200).json({ ok: true });
};
