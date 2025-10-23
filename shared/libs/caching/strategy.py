"""Production-grade caching strategies for WeatherVane data and models.

Provides multiple caching implementations optimized for different workload
characteristics:
- InMemoryCache: Fast, zero-latency, suitable for single-instance systems
- TTLCache: Time-based expiration with automatic refresh
- LRUCache: Memory-bounded eviction policy
- HybridCache: Multi-tier caching (memory + optional backend)

All caches are thread-safe and provide consistent interfaces for:
- get(key): Retrieve value, returns None if miss
- set(key, value, ttl=None): Store value with optional TTL
- delete(key): Remove key
- clear(): Clear entire cache
- stats(): Return cache performance statistics
"""

from __future__ import annotations

import logging
import threading
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Dict, Generic, Optional, TypeVar

_LOGGER = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class CacheConfig:
    """Configuration for cache behavior."""

    max_size: Optional[int] = None
    """Maximum number of entries (None = unlimited)"""

    default_ttl_seconds: Optional[float] = None
    """Default time-to-live for entries (None = no expiration)"""

    enable_stats: bool = True
    """Track hit/miss/eviction statistics"""

    backend_type: Optional[str] = None
    """Optional backend: 'redis', 'disk', or None for memory-only"""

    backend_config: Dict[str, Any] = field(default_factory=dict)
    """Configuration for optional backend (url, path, etc)"""


@dataclass
class CacheStats:
    """Cache performance statistics."""

    hits: int = 0
    """Number of cache hits"""

    misses: int = 0
    """Number of cache misses"""

    evictions: int = 0
    """Number of entries evicted"""

    total_size: int = 0
    """Current number of entries in cache"""

    max_size: Optional[int] = None
    """Maximum capacity"""

    @property
    def hit_rate(self) -> float:
        """Percentage of requests that were cache hits."""
        total = self.hits + self.misses
        return (self.hits / total * 100) if total > 0 else 0.0

    @property
    def miss_rate(self) -> float:
        """Percentage of requests that were cache misses."""
        return 100.0 - self.hit_rate


class Cache(ABC, Generic[T]):
    """Abstract base class for cache implementations."""

    @abstractmethod
    def get(self, key: str) -> Optional[T]:
        """Retrieve value by key.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        pass

    @abstractmethod
    def set(self, key: str, value: T, ttl_seconds: Optional[float] = None) -> None:
        """Store value with optional TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Time-to-live in seconds (None = use default or no expiration)
        """
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Remove key from cache.

        Args:
            key: Cache key

        Returns:
            True if key existed and was deleted, False otherwise
        """
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clear entire cache."""
        pass

    @abstractmethod
    def stats(self) -> CacheStats:
        """Return cache statistics."""
        pass


class InMemoryCache(Cache[T]):
    """Fast, thread-safe in-memory cache implementation.

    Suitable for:
    - Single-instance deployments
    - Development/testing
    - Workloads where loss on restart is acceptable
    - Sub-second latency requirements

    Not suitable for:
    - Multi-instance deployments needing shared cache
    - Data requiring persistence across restarts
    - Very large datasets (limited by RAM)
    """

    def __init__(self, config: CacheConfig = CacheConfig()):
        """Initialize in-memory cache.

        Args:
            config: Cache configuration
        """
        self._config = config
        self._cache: Dict[str, tuple[Any, Optional[float]]] = {}
        self._lock = threading.RLock()
        self._stats = CacheStats(max_size=config.max_size)
        _LOGGER.info(
            f"Initialized InMemoryCache (max_size={config.max_size}, "
            f"default_ttl={config.default_ttl_seconds}s)"
        )

    def get(self, key: str) -> Optional[T]:
        """Retrieve value, checking expiration."""
        with self._lock:
            if key not in self._cache:
                self._stats.misses += 1
                return None

            value, expiry = self._cache[key]

            # Check expiration
            if expiry is not None and time.time() > expiry:
                del self._cache[key]
                self._stats.misses += 1
                self._stats.evictions += 1
                return None

            self._stats.hits += 1
            return value

    def set(self, key: str, value: T, ttl_seconds: Optional[float] = None) -> None:
        """Store value with optional TTL."""
        ttl = ttl_seconds if ttl_seconds is not None else self._config.default_ttl_seconds
        expiry = (time.time() + ttl) if ttl else None

        with self._lock:
            # Check size limit before insertion
            if (
                self._config.max_size
                and key not in self._cache
                and len(self._cache) >= self._config.max_size
            ):
                _LOGGER.warning(
                    f"InMemoryCache at capacity ({self._config.max_size}), "
                    f"dropping new entry for key={key}"
                )
                self._stats.evictions += 1
                return

            self._cache[key] = (value, expiry)

    def delete(self, key: str) -> bool:
        """Remove key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear entire cache."""
        with self._lock:
            self._cache.clear()
            _LOGGER.info("InMemoryCache cleared")

    def stats(self) -> CacheStats:
        """Return cache statistics."""
        with self._lock:
            self._stats.total_size = len(self._cache)
            return CacheStats(
                hits=self._stats.hits,
                misses=self._stats.misses,
                evictions=self._stats.evictions,
                total_size=self._stats.total_size,
                max_size=self._config.max_size,
            )


class TTLCache(Cache[T]):
    """Time-to-live based cache with automatic expiration and refresh.

    Suitable for:
    - Data that becomes stale after a known time (weather, forecasts)
    - Reducing load on backends with predictable refresh cycles
    - Simplified invalidation logic (time-based vs event-based)

    Features:
    - Automatic expiration checking
    - Optional refresh callback for stale entries
    - Thread-safe operations
    """

    def __init__(
        self,
        config: CacheConfig,
        refresh_callback: Optional[callable] = None,
    ):
        """Initialize TTL cache.

        Args:
            config: Cache configuration (default_ttl_seconds should be set)
            refresh_callback: Optional callable(key) -> value to refresh stale entries
        """
        if not config.default_ttl_seconds:
            raise ValueError("TTLCache requires default_ttl_seconds in config")

        self._config = config
        self._cache: Dict[str, tuple[Any, float]] = {}
        self._refresh_callback = refresh_callback
        self._lock = threading.RLock()
        self._stats = CacheStats(max_size=config.max_size)
        _LOGGER.info(
            f"Initialized TTLCache (ttl={config.default_ttl_seconds}s, "
            f"refresh_callback={refresh_callback is not None})"
        )

    def get(self, key: str) -> Optional[T]:
        """Retrieve value, checking expiration and attempting refresh."""
        with self._lock:
            if key not in self._cache:
                self._stats.misses += 1
                return None

            value, expiry = self._cache[key]
            now = time.time()

            # Entry expired
            if now > expiry:
                # Try refresh if callback available
                if self._refresh_callback:
                    try:
                        new_value = self._refresh_callback(key)
                        self._cache[key] = (new_value, now + self._config.default_ttl_seconds)
                        self._stats.hits += 1
                        _LOGGER.debug(f"TTLCache refreshed {key} via callback")
                        return new_value
                    except Exception as e:
                        _LOGGER.warning(f"TTLCache refresh failed for {key}: {e}")

                # No refresh, entry is expired
                del self._cache[key]
                self._stats.misses += 1
                self._stats.evictions += 1
                return None

            self._stats.hits += 1
            return value

    def set(self, key: str, value: T, ttl_seconds: Optional[float] = None) -> None:
        """Store value with TTL."""
        ttl = ttl_seconds if ttl_seconds is not None else self._config.default_ttl_seconds
        expiry = time.time() + ttl

        with self._lock:
            if (
                self._config.max_size
                and key not in self._cache
                and len(self._cache) >= self._config.max_size
            ):
                self._stats.evictions += 1
                _LOGGER.warning(f"TTLCache at capacity, dropping {key}")
                return

            self._cache[key] = (value, expiry)

    def delete(self, key: str) -> bool:
        """Remove key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear entire cache."""
        with self._lock:
            self._cache.clear()
            _LOGGER.info("TTLCache cleared")

    def stats(self) -> CacheStats:
        """Return cache statistics."""
        with self._lock:
            # Count non-expired entries
            now = time.time()
            valid_entries = sum(1 for _, expiry in self._cache.values() if now <= expiry)
            self._stats.total_size = valid_entries

            return CacheStats(
                hits=self._stats.hits,
                misses=self._stats.misses,
                evictions=self._stats.evictions,
                total_size=self._stats.total_size,
                max_size=self._config.max_size,
            )


class LRUCache(Cache[T]):
    """Least-recently-used cache with bounded size and O(1) operations.

    Suitable for:
    - Multi-tenant systems with bounded number of active models
    - Fixed memory budget
    - Workloads with locality of reference (hot tenants)

    Features:
    - O(1) get/set/delete operations
    - LRU eviction when full
    - Thread-safe operations
    """

    def __init__(self, config: CacheConfig):
        """Initialize LRU cache.

        Args:
            config: Cache configuration (max_size required)
        """
        if not config.max_size:
            raise ValueError("LRUCache requires max_size in config")

        self._config = config
        self._cache: OrderedDict[str, T] = OrderedDict()
        self._lock = threading.RLock()
        self._stats = CacheStats(max_size=config.max_size)
        _LOGGER.info(f"Initialized LRUCache (max_size={config.max_size})")

    def get(self, key: str) -> Optional[T]:
        """Retrieve value and mark as recently used."""
        with self._lock:
            if key not in self._cache:
                self._stats.misses += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._stats.hits += 1
            return self._cache[key]

    def set(self, key: str, value: T, ttl_seconds: Optional[float] = None) -> None:
        """Store value, evicting LRU entry if necessary."""
        with self._lock:
            # If key exists, update and mark as recently used
            if key in self._cache:
                self._cache[key] = value
                self._cache.move_to_end(key)
                return

            # If cache full, evict LRU entry
            if len(self._cache) >= self._config.max_size:
                lru_key, _ = self._cache.popitem(last=False)
                self._stats.evictions += 1
                _LOGGER.debug(f"LRUCache evicted {lru_key} (LRU)")

            # Insert new entry (at end = most recently used)
            self._cache[key] = value

    def delete(self, key: str) -> bool:
        """Remove key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear entire cache."""
        with self._lock:
            self._cache.clear()
            _LOGGER.info("LRUCache cleared")

    def stats(self) -> CacheStats:
        """Return cache statistics."""
        with self._lock:
            return CacheStats(
                hits=self._stats.hits,
                misses=self._stats.misses,
                evictions=self._stats.evictions,
                total_size=len(self._cache),
                max_size=self._config.max_size,
            )


class HybridCache(Cache[T]):
    """Multi-tier cache combining fast memory with optional persistent backend.

    Suitable for:
    - Systems needing fast access but persistence across restarts
    - Load-balanced multi-instance deployments (via shared backend)
    - Graceful degradation on backend failure

    Structure:
    - L1: Fast in-memory cache (InMemoryCache or LRUCache)
    - L2: Optional persistent backend (redis, disk, etc)

    Behavior:
    - Get: Check L1 → if miss, check L2 → if miss, return None
    - Set: Write to L1 immediately, async write to L2
    - Delete: Remove from both L1 and L2
    """

    def __init__(
        self,
        config: CacheConfig,
        l1_cache: Optional[Cache[T]] = None,
    ):
        """Initialize hybrid cache.

        Args:
            config: Cache configuration
            l1_cache: L1 cache instance (default: InMemoryCache)
        """
        self._config = config
        self._l1 = l1_cache or InMemoryCache(config)
        self._lock = threading.RLock()
        self._stats = CacheStats(max_size=config.max_size)

        # TODO: Implement L2 backend support (redis, disk)
        # For now, HybridCache = optimized InMemoryCache
        _LOGGER.info(
            f"Initialized HybridCache (l1_type={type(self._l1).__name__}, "
            f"backend={config.backend_type or 'none'})"
        )

    def get(self, key: str) -> Optional[T]:
        """Retrieve from L1 or L2."""
        with self._lock:
            # Try L1 first
            value = self._l1.get(key)
            if value is not None:
                return value

            # L1 miss - could check L2 backend here
            # TODO: Implement L2 lookup and repopulate L1
            self._stats.misses += 1
            return None

    def set(self, key: str, value: T, ttl_seconds: Optional[float] = None) -> None:
        """Write to L1, optionally persist to L2."""
        with self._lock:
            self._l1.set(key, value, ttl_seconds)
            # TODO: Async write to L2 backend if configured

    def delete(self, key: str) -> bool:
        """Remove from L1 and L2."""
        with self._lock:
            result = self._l1.delete(key)
            # TODO: Remove from L2 backend if configured
            return result

    def clear(self) -> None:
        """Clear L1 and L2."""
        with self._lock:
            self._l1.clear()
            # TODO: Clear L2 backend if configured
            _LOGGER.info("HybridCache cleared")

    def stats(self) -> CacheStats:
        """Return combined statistics from L1 and L2."""
        with self._lock:
            l1_stats = self._l1.stats()
            # TODO: Combine with L2 stats
            return l1_stats
