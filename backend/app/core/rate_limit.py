"""Process-local sliding windows; deploy one worker until a shared store is configured."""
import asyncio
import math
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Callable, Protocol

from fastapi import HTTPException, Request

from app.core.config import get_settings


@dataclass(frozen=True)
class Rule:
    name: str
    limit: int
    seconds: int


class Store(Protocol):
    async def check(self, entries: list[tuple[Rule, str]], *, consume: bool = False) -> None: ...
    async def reset(self, rule: Rule, key: str) -> None: ...
    async def cleanup(self) -> None: ...


class SlidingWindowStore:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic, capacity: int = 10000):
        if capacity < 1:
            raise ValueError('capacity must be positive')
        self.clock = clock
        self.capacity = capacity
        self.lock = asyncio.Lock()
        self.windows: OrderedDict[tuple[str, str], tuple[deque[float], int]] = OrderedDict()

    def _window(self, rule: Rule, key: str, now: float) -> deque[float]:
        identity = (rule.name, key)
        if identity not in self.windows:
            if len(self.windows) >= self.capacity:
                # Fail closed rather than allowing an attacker to evict an active limit.
                self._cleanup(now)
            if len(self.windows) >= self.capacity:
                raise limited(1)
            self.windows[identity] = (deque(), rule.seconds)
        events, _ = self.windows[identity]
        while events and events[0] <= now - rule.seconds:
            events.popleft()
        self.windows.move_to_end(identity)
        return events

    def _cleanup(self, now: float) -> None:
        for identity, (events, seconds) in list(self.windows.items()):
            while events and events[0] <= now - seconds:
                events.popleft()
            if not events:
                del self.windows[identity]

    async def check(self, entries: list[tuple[Rule, str]], *, consume: bool = False) -> None:
        async with self.lock:
            now = self.clock()
            windows = [(rule, self._window(rule, key, now)) for rule, key in entries]
            wait = max((events[0] + rule.seconds - now for rule, events in windows if len(events) >= rule.limit), default=0)
            if wait > 0:
                raise limited(wait)
            if consume:
                for _, events in windows:
                    events.append(now)

    async def reset(self, rule: Rule, key: str) -> None:
        async with self.lock:
            self.windows.pop((rule.name, key), None)

    async def cleanup(self) -> None:
        async with self.lock:
            self._cleanup(self.clock())


def limited(seconds: float) -> HTTPException:
    retry = max(1, math.ceil(seconds))
    return HTTPException(429, detail={'code': 'rate_limited', 'retry_after': retry}, headers={'Retry-After': str(retry)})


store: Store = SlidingWindowStore()
# Serialize failure checks and verification so concurrent requests cannot bypass a limit.
failure_lock = asyncio.Lock()


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else 'unknown'
    hops = get_settings().TRUSTED_PROXY_COUNT
    if hops > 0:
        addresses = request.headers.get('x-forwarded-for', '').split(',')
        if len(addresses) >= hops:
            try:
                return str(ip_address(addresses[-hops].strip()))
            except ValueError:
                pass
    return peer


def rule(name: str) -> Rule:
    settings = get_settings()
    limit, seconds = {
        'login_pair': (settings.RATE_LOGIN_PAIR, 900),
        'login_email': (settings.RATE_LOGIN_EMAIL, 900),
        'login_ip': (settings.RATE_LOGIN_IP, 60),
        'signup_ip': (settings.RATE_SIGNUP_IP, 3600),
        'signup_email': (settings.RATE_SIGNUP_EMAIL, 3600),
        'refresh_ip': (settings.RATE_REFRESH_IP, 60),
        'password_user': (settings.RATE_PROFILE_FAILURES, 900),
        'email_user': (settings.RATE_PROFILE_FAILURES, 900),
        'service_upload': (settings.RATE_SERVICE_UPLOAD, 3600),
        'avatar_upload': (settings.RATE_AVATAR_UPLOAD, 3600),
        'admin_upload': (settings.RATE_ADMIN_UPLOAD, 3600),
    }[name]
    return Rule(name, limit, seconds)


async def check(entries: list[tuple[Rule, str]], *, consume: bool = False) -> None:
    await store.check(entries, consume=consume)


async def record_failure(entries: list[tuple[Rule, str]]) -> None:
    await store.check(entries, consume=True)


async def reset(selected: Rule, key: str) -> None:
    await store.reset(selected, key)


def dependency(name: str):
    async def enforce(request: Request) -> None:
        await check([(rule(name), client_ip(request))], consume=True)
    return enforce


@asynccontextmanager
async def cleanup_task():
    async def run():
        while True:
            await asyncio.sleep(60)
            await store.cleanup()
    task = asyncio.create_task(run())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
