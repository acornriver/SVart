"""SVartTower 로컬 서버 (대기열을 늘린 정적 서버, 8766). SVart 옆 폴더의 SVartTower를 엽니다.
실행: python3 scripts/serve-tower.py"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class S(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
S(("", 8766), partial(H, directory=str(__import__("pathlib").Path(__file__).resolve().parent.parent.parent / "SVartTower"))).serve_forever()
