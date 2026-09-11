#!/usr/bin/env python3
"""Local dev server that mirrors Vercel's `cleanUrls: true`.

Without this, /about and /faq 404 locally while working fine in production,
because Python's stock handler won't try the .html extension. Run via
.claude/launch.json; not used in deployment.

It also stands in for one of the two serverless functions: /api/luma-events
is a public GET with no secrets, so it is mirrored here and the events page
previews with real data instead of needing `vercel dev`. /api/subscribe is
not mirrored — it holds credentials and answers only POST, and pretending
otherwise locally would hide the fact that it needs the real runtime.
"""
import functools, http.server, json, os, socketserver, ssl, sys, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321


LUMA = ('https://api.lu.ma/calendar/get-items'
        '?calendar_api_id=cal-mqlFFooPRU3qIZi&period={period}&pagination_limit=40')

CITY_ALIAS = {'\u062f\u0628\u064a': 'Dubai'}

# Luma answers 403 to Python's default user-agent, and a python.org install
# on macOS ships without a CA bundle unless certifi is around. Both are local
# problems only — Vercel's Node runtime has neither — so they are solved here
# rather than by weakening anything in api/luma-events.js.
UA = 'babesnet-devserver (+https://babesnet.xyz)'


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()



def trim(entry):
    event = (entry or {}).get('event') or {}
    if event.get('visibility') != 'public' or not event.get('url'):
        return None

    offline = event.get('location_type') == 'offline'
    geo = event.get('geo_address_info') or {}
    city = geo.get('city') or geo.get('region') or ''
    city = CITY_ALIAS.get(city, city) or geo.get('country') or ''

    return {
        'id': event.get('api_id'),
        'name': event.get('name'),
        'url': 'https://lu.ma/' + event['url'],
        'start': event.get('start_at'),
        'tz': event.get('timezone') or 'UTC',
        'city': 'Online' if not offline else city,
        'online': not offline,
        'cover': event.get('cover_url') or None,
        'guests': entry.get('guest_count') if isinstance(entry.get('guest_count'), int) else None,
        'free': bool((entry.get('ticket_info') or {}).get('is_free')),
        'soldOut': bool((entry.get('ticket_info') or {}).get('is_sold_out')),
    }


class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/api/luma-events':
            return self.luma_events()
        return super().do_GET()

    def luma_events(self):
        """Mirrors api/luma-events.js — the SAME shape, not Luma's raw one.
        Two shapes would mean the grid works here and breaks in production,
        which is the one bug a dev server must never invent. Keep this trim
        and the one in api/luma-events.js in step."""
        body = json.dumps({
            'upcoming': self.luma_period('future'),
            'past': self.luma_period('past'),
        }).encode()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def luma_period(self, period):
        req = urllib.request.Request(LUMA.format(period=period),
                                     headers={'accept': 'application/json',
                                              'user-agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=10, context=_ssl_context()) as r:
                entries = json.load(r).get('entries', [])
        except Exception as err:                      # noqa: BLE001 — dev only
            print(f'luma-events ({period}): {err}')
            return []

        return [trimmed for trimmed in map(trim, entries) if trimmed]

    def translate_path(self, path):
        local = super().translate_path(path)
        if not os.path.exists(local) and not path.rstrip('/').endswith('.html'):
            candidate = local.rstrip('/') + '.html'
            if os.path.isfile(candidate):
                return candidate
        return local

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '" 200' not in (fmt % args):
            super().log_message(fmt, *args)


socketserver.TCPServer.allow_reuse_address = True
handler = functools.partial(CleanURLHandler, directory=ROOT)
with socketserver.TCPServer(('', PORT), handler) as httpd:
    print(f'serving {ROOT} on http://localhost:{PORT} (clean URLs on)')
    httpd.serve_forever()
