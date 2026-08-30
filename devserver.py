#!/usr/bin/env python3
"""Local dev server that mirrors Vercel's `cleanUrls: true`.

Without this, /about and /faq 404 locally while working fine in production,
because Python's stock handler won't try the .html extension. Run via
.claude/launch.json; not used in deployment.
"""
import functools, http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321


class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
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
