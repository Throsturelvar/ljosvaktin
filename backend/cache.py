import threading
import time


class TTLCache:
    """Thread-safe key/value store. A background refresher writes to it;
    request handlers only ever read from it, so a slow upstream API
    never blocks an incoming HTTP request."""

    def __init__(self):
        self._lock = threading.Lock()
        self._store = {}

    def get(self, key):
        with self._lock:
            entry = self._store.get(key)
            return entry["value"] if entry else None

    def set(self, key, value):
        with self._lock:
            self._store[key] = {"value": value, "updated": time.time()}

    def age_seconds(self, key):
        with self._lock:
            entry = self._store.get(key)
            return (time.time() - entry["updated"]) if entry else None
