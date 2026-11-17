"""GitHub Pages용 index.html과 sw.js를 만든다.

- web/page.html(앱 본문: <title>, <style>, 화면, 스크립트)을 완전한 HTML 문서로 감싸 index.html을 만든다.
  같은 page.html은 claude.ai 아티팩트로 올릴 때도 그대로 쓴다(아티팩트가 문서 틀을 씌워 줌).
- sw.js(오프라인용 서비스 워커)의 캐시 버전을 파일 내용으로 계산해 넣는다.
  앱이나 자료를 고치고 이 스크립트를 다시 돌리면 버전이 바뀌어, 접속한 기기가 새 파일을 받는다.

사용법 (프로젝트 루트에서)
  python -I tools/build_site.py
"""
import hashlib
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SHELL = [
    "./", "./index.html", "./web/app.js", "./web/figures.js",
    "./data/items.json", "./data/questions.json", "./data/units.json",
    "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png",
]

HEAD = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{lead}
<meta name="description" content="기술·가정 시험 대비 — 교과서와 유인물에 표시한 내용으로 만든 공부 앱(태블릿)과 오지선다 퀴즈 앱(폰)">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="기가 마스터">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}}body{{margin:0;font:14px system-ui,sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
</head>
<body>
"""

TAIL = """<script>
/* 오프라인용 서비스 워커: https(GitHub Pages)에서만 켠다 */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
</script>
</body>
</html>
"""

SW = """/* sw.js — 오프라인에서도 앱이 열리게 하는 서비스 워커 (tools/build_site.py가 만든다)
   네트워크 우선: 인터넷이 되면 항상 최신 파일을 받고, 안 되면 마지막에 받아 둔 파일로 연다. */
var VERSION = 'giga-{version}';
var SHELL = {shell};

self.addEventListener('install', function (event) {{
  event.waitUntil(caches.open(VERSION)
    .then(function (cache) {{ return cache.addAll(SHELL); }})
    .then(function () {{ return self.skipWaiting(); }}));
}});

self.addEventListener('activate', function (event) {{
  event.waitUntil(caches.keys()
    .then(function (keys) {{ return Promise.all(keys.map(function (k) {{ return k === VERSION ? null : caches.delete(k); }})); }})
    .then(function () {{ return self.clients.claim(); }}));
}});

self.addEventListener('fetch', function (event) {{
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(fetch(req).then(function (res) {{
    if (res && res.ok) {{ var copy = res.clone(); caches.open(VERSION).then(function (c) {{ c.put(req, copy); }}); }}
    return res;
  }}).catch(function () {{
    return caches.match(req, {{ignoreSearch: true}}).then(function (hit) {{ return hit || caches.match('./index.html'); }});
  }}));
}});
"""


def main():
    with open(os.path.join(ROOT, "web", "page.html"), encoding="utf-8") as f:
        page = f.read()
    # 맨 앞의 <title>, <meta> 줄은 head로 옮긴다
    lead_lines, rest = [], page.splitlines(keepends=True)
    while rest and re.match(r"\s*<(title|meta)\b", rest[0]):
        line = rest.pop(0)
        if "claude:viewport-fit-sides" not in line:  # 아티팩트 전용 표시는 뺀다
            lead_lines.append(line.rstrip("\n"))
    html = HEAD.format(lead="\n".join(lead_lines)) + "".join(rest).rstrip() + "\n" + TAIL
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    h = hashlib.sha1()
    for p in SHELL:
        path = os.path.join(ROOT, p[2:]) if p != "./" else None
        if path and os.path.isfile(path):
            with open(path, "rb") as f:
                h.update(f.read())
    version = h.hexdigest()[:10]
    with open(os.path.join(ROOT, "sw.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(SW.format(version=version, shell=json.dumps(SHELL, ensure_ascii=False)))
    print(f"index.html, sw.js 생성 (캐시 버전 giga-{version})")


if __name__ == "__main__":
    main()
