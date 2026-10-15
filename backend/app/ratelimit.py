"""Fixed-window rate limiting for endpoints that can be hammered.

ponytail: per-process counters. With N uvicorn workers the effective limit is N times
higher, and counters reset on restart. Move the counters to Redis (INCR + EXPIRE) when
the API runs more than one worker or instance.
"""
import logging
import math
import threading
import time

from fastapi import HTTPException, Request, status

log = logging.getLogger("eex.security")

# Bound memory when an attacker rotates keys (IPs, emails).
_MAX_KEYS = 50_000


class RateLimiter:
    def __init__(self, name: str, limit: int, window_seconds: int) -> None:
        self.name = name
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        """Count one request for `key`; raise 429 once the window is full."""
        now = time.monotonic()
        with self._lock:
            start, count = self._hits.get(key, (now, 0))
            if now - start >= self.window:
                start, count = now, 0
            count += 1
            if len(self._hits) >= _MAX_KEYS and key not in self._hits:
                self._prune(now)
            self._hits[key] = (start, count)
        if count > self.limit:
            retry_after = max(1, math.ceil(self.window - (now - start)))
            log.warning("rate_limited limiter=%s key=%s", self.name, _redact(key))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره امتحان کنید | Too many requests, try again later",
                headers={"Retry-After": str(retry_after)},
            )

    def _prune(self, now: float) -> None:
        expired = [k for k, (start, _) in self._hits.items() if now - start >= self.window]
        for k in expired:
            del self._hits[k]
        if len(self._hits) >= _MAX_KEYS:  # still full: everyone is live, start over
            self._hits.clear()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def by_ip(self, request: Request) -> None:
        """FastAPI dependency: limit by client address."""
        self.hit(client_ip(request))


def client_ip(request: Request) -> str:
    # uvicorn only rewrites request.client from X-Forwarded-For when started with
    # --proxy-headers and the proxy is listed in --forwarded-allow-ips, so this
    # cannot be spoofed by a direct client.
    return request.client.host if request.client else "unknown"


def _redact(key: str) -> str:
    """Log enough to correlate an attack without writing full emails to the log."""
    if "@" in key:
        local, _, domain = key.partition("@")
        return f"{local[:2]}***@{domain}"
    return key


login_by_ip = RateLimiter("login_ip", limit=10, window_seconds=60)
login_by_email = RateLimiter("login_email", limit=20, window_seconds=15 * 60)
calculator_by_ip = RateLimiter("calculator_ip", limit=60, window_seconds=60)
analyze_by_ip = RateLimiter("analyze_ip", limit=30, window_seconds=60)
leads_by_ip = RateLimiter("leads_ip", limit=5, window_seconds=10 * 60)
api_by_user = RateLimiter("api_user", limit=600, window_seconds=60)

ALL_LIMITERS = (login_by_ip, login_by_email, calculator_by_ip, analyze_by_ip, leads_by_ip, api_by_user)
