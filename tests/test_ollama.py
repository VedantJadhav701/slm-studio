"""Tests for slmstudio.ollama HTTP API client without requiring a real Ollama instance."""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import unittest

from slmstudio.ollama import (
    OllamaClient,
    OllamaConnectionError,
    OllamaError,
    normalise_url,
)


class MockOllamaHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress console logging

    def do_GET(self):
        if self.path == "/api/tags":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {"models": [{"name": "llama3.2:1b"}, {"name": "nomic-embed-text"}]}
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8")
        data = json.loads(body) if body else {}

        if self.path == "/api/chat":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            if data.get("stream"):
                self.wfile.write(b'{"message": {"role": "assistant", "content": "Hello"}}\n')
                self.wfile.write(b'{"message": {"role": "assistant", "content": " world"}}\n')
            else:
                resp = {"message": {"role": "assistant", "content": "Hello world"}, "done": True}
                self.wfile.write(json.dumps(resp).encode("utf-8"))
        elif self.path == "/api/embeddings":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {"embedding": [0.1, 0.2, 0.3, 0.4]}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        elif self.path == "/api/error":
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "model not found"}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


class TestOllamaClient(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), MockOllamaHandler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_normalise_url(self):
        self.assertEqual(normalise_url("127.0.0.1:11434"), "http://127.0.0.1:11434")
        self.assertEqual(normalise_url("http://localhost:11434/"), "http://localhost:11434")
        self.assertEqual(normalise_url("https://my-server.lan:11434/api"), "https://my-server.lan:11434")
        self.assertEqual(normalise_url(""), "http://127.0.0.1:11434")

    def test_status_and_models(self):
        client = OllamaClient(base_url=f"http://127.0.0.1:{self.port}")
        st = client.status()
        self.assertTrue(st["running"])
        self.assertIn("llama3.2:1b", st["models"])

    def test_chat_non_streaming(self):
        client = OllamaClient(base_url=f"http://127.0.0.1:{self.port}")
        res = client.chat(model="llama3.2:1b", messages=[{"role": "user", "content": "hi"}])
        self.assertEqual(res["message"]["content"], "Hello world")

    def test_chat_streaming(self):
        client = OllamaClient(base_url=f"http://127.0.0.1:{self.port}")
        stream = client.chat(model="llama3.2:1b", messages=[{"role": "user", "content": "hi"}], stream=True)
        chunks = list(stream)
        self.assertEqual(len(chunks), 2)
        combined = "".join(c["message"]["content"] for c in chunks)
        self.assertEqual(combined, "Hello world")

    def test_embeddings(self):
        client = OllamaClient(base_url=f"http://127.0.0.1:{self.port}")
        vec = client.embeddings(model="nomic-embed-text", prompt="test document")
        self.assertEqual(len(vec), 4)

    def test_unreachable_server_gives_clear_connection_error(self):
        # Pick an unused port
        client = OllamaClient(base_url="http://127.0.0.1:59999", timeout=1.0)
        with self.assertRaises(OllamaConnectionError) as ctx:
            client.status()
        self.assertIn("Ollama is not running at http://127.0.0.1:59999", str(ctx.exception))

    def test_http_error_reported(self):
        client = OllamaClient(base_url=f"http://127.0.0.1:{self.port}")
        with self.assertRaises(OllamaError) as ctx:
            client._request("/api/error", data={"bad": True})
        self.assertIn("model not found", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
