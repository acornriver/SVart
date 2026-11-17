#!/usr/bin/env python3
"""로컬 개발·테스트 서버. `python3 -m http.server`는 접속 대기열이 5개라 브라우저가 한꺼번에 여는 요청(스크립트·음성 57개·영상)을
끊어 버려 첫 화면이 가끔 뜨지 않았습니다(11/17 확인: ERR_CONNECTION_RESET). 대기열을 늘린 같은 서버입니다.
실행: (레포 루트에서) python3 scripts/serve.py [포트=8765]"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Server(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # 요청 로그는 남기지 않음 (오류는 그대로 stderr)
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = Path(__file__).resolve().parent.parent
    print(f"http://localhost:{port}  ({root})")
    Server(("", port), partial(Handler, directory=str(root))).serve_forever()
