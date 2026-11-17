"""검수 페이지용 로컬 서버.

프로젝트 폴더를 그대로 보여 주고(review.html, data/, review/ …),
review.html에서 고친 내용을 POST /api/review-state 로 받아 work/review_result.json 에 저장한다.
이 컴퓨터(127.0.0.1)에서만 열린다.

사용법 (프로젝트 루트에서)
  python -I tools/review_server.py [포트]      # 기본 8765
  → 브라우저에서 http://127.0.0.1:8765/review.html
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "work", "review_result.json")
MAX_BODY = 2 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 데이터 파일은 항상 새로 읽게 한다
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # /app : tools/build_site.py가 만든 index.html(GitHub Pages와 같은 문서)을 보여 준다
        if self.path.split("?")[0] in ("/app", "/app.html"):
            with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
                html = f.read().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/review-state":
            return self._reply(404, {"ok": False, "error": "없는 주소"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._reply(413, {"ok": False, "error": "크기가 맞지 않음"})
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            if not isinstance(data, dict) or not isinstance(data.get("items"), dict):
                raise ValueError("형식이 맞지 않음")
        except Exception as e:  # noqa: BLE001
            return self._reply(400, {"ok": False, "error": str(e)})
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        tmp = STATE + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, STATE)
        return self._reply(200, {"ok": True})

    def log_message(self, fmt, *args):
        if self.command == "POST" or not str(args[1] if len(args) > 1 else "").startswith(("200", "304")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"검수 서버: http://127.0.0.1:{port}/review.html  (끄려면 Ctrl+C)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
