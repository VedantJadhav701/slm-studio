"""Local Ollama HTTP API client for SLM Studio.

Uses only Python's standard library. Connects directly to the local Ollama instance
configured by the user (defaulting to http://127.0.0.1:11434).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_SECS = 120.0


class OllamaError(Exception):
    """Base exception for Ollama client errors."""
    pass


class OllamaConnectionError(OllamaError):
    """Raised when Ollama cannot be reached."""
    pass


def normalise_url(url: Optional[str]) -> str:
    if not url or not isinstance(url, str):
        return DEFAULT_OLLAMA_URL
    trimmed = url.strip().rstrip("/")
    if not (trimmed.startswith("http://") or trimmed.startswith("https://")):
        trimmed = f"http://{trimmed}"
    parsed = urllib.parse.urlsplit(trimmed)
    if not parsed.netloc:
        return DEFAULT_OLLAMA_URL
    return f"{parsed.scheme}://{parsed.netloc}"


class OllamaClient:
    """Client for local Ollama server."""

    def __init__(self, base_url: str = DEFAULT_OLLAMA_URL, timeout: float = DEFAULT_TIMEOUT_SECS):
        self.base_url = normalise_url(base_url)
        self.timeout = timeout

    def _request(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        method: Optional[str] = None,
        stream: bool = False,
    ) -> Any:
        url = f"{self.base_url}{endpoint}"
        headers = {"Accept": "application/json"}
        payload = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers=headers, method=method)
        try:
            resp = urllib.request.urlopen(req, timeout=self.timeout)
            if stream:
                return resp
            with resp:
                body = resp.read().decode("utf-8")
                if not body.strip():
                    return {}
                return json.loads(body)
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8")
                data_err = json.loads(body)
                msg = data_err.get("error", str(exc))
            except Exception:
                msg = body or str(exc)
            raise OllamaError(f"Ollama HTTP {exc.code}: {msg}") from exc
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            raise OllamaConnectionError(
                f"Ollama is not running at {self.base_url}. Start Ollama or check Settings."
            ) from exc

    def status(self) -> Dict[str, Any]:
        """Check status and list available models."""
        data = self._request("/api/tags", method="GET")
        models = [m.get("name") for m in data.get("models", []) if "name" in m]
        return {"running": True, "base_url": self.base_url, "models": models}

    def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        stream: bool = False,
        options: Optional[Dict[str, Any]] = None,
    ) -> Any:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": stream,
        }
        if options:
            payload["options"] = options

        if not stream:
            return self._request("/api/chat", data=payload)

        raw_resp = self._request("/api/chat", data=payload, stream=True)
        return self._stream_lines(raw_resp)

    def generate(
        self,
        model: str,
        prompt: str,
        stream: bool = False,
        options: Optional[Dict[str, Any]] = None,
    ) -> Any:
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": stream,
        }
        if options:
            payload["options"] = options

        if not stream:
            return self._request("/api/generate", data=payload)

        raw_resp = self._request("/api/generate", data=payload, stream=True)
        return self._stream_lines(raw_resp)

    def embeddings(self, model: str, prompt: str) -> List[float]:
        payload = {"model": model, "prompt": prompt}
        data = self._request("/api/embeddings", data=payload)
        embedding = data.get("embedding", [])
        if not embedding and "embeddings" in data:
            emb_list = data.get("embeddings", [])
            embedding = emb_list[0] if emb_list else []
        return embedding

    def _stream_lines(self, response: Any) -> Iterator[Dict[str, Any]]:
        with response:
            for line in response:
                text = line.decode("utf-8").strip()
                if not text:
                    continue
                try:
                    yield json.loads(text)
                except json.JSONDecodeError:
                    continue
