"""Comprehensive tests for caching strategy implementations.

Tests cover:
- InMemoryCache: Basic operations, expiration, size limits
- TTLCache: TTL expiration, refresh callbacks
- LRUCache: LRU eviction, O(1) operations
- HybridCache: Multi-tier behavior
- Thread safety: Concurrent access patterns
- Performance: Latency and throughput characteristics
"""

import pytest
import threading
import time
from typing import Optional

from shared.libs.caching.strategy import (
    Cache,
    InMemoryCache,
    TTLCache,
    LRUCache,
    HybridCache,
    CacheConfig,
    CacheStats,
)


class TestInMemoryCache:
    """Tests for InMemoryCache implementation."""

    def test_basic_get_set(self):
        """Test basic get/set operations."""
        cache = InMemoryCache()
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        assert cache.get("key2") is None

    def test_delete(self):
        """Test delete operation."""
        cache = InMemoryCache()
        cache.set("key1", "value1")
        assert cache.delete("key1") is True
        assert cache.get("key1") is None
        assert cache.delete("key1") is False

    def test_clear(self):
        """Test clearing cache."""
        cache = InMemoryCache()
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None

    def test_ttl_expiration(self):
        """Test time-to-live expiration."""
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=0.1)
        assert cache.get("key1") == "value1"
        time.sleep(0.15)
        assert cache.get("key1") is None

    def test_default_ttl(self):
        """Test default TTL from config."""
        config = CacheConfig(default_ttl_seconds=0.1)
        cache = InMemoryCache(config)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        time.sleep(0.15)
        assert cache.get("key1") is None

    def test_size_limit(self):
        """Test size limit enforcement."""
        config = CacheConfig(max_size=2)
        cache = InMemoryCache(config)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # Should be dropped
        assert cache.get("key1") == "value1"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") is None

    def test_hit_miss_stats(self):
        """Test cache hit/miss statistics."""
        cache = InMemoryCache()
        cache.set("key1", "value1")

        # One hit
        cache.get("key1")
        # Two misses
        cache.get("key2")
        cache.get("key3")

        stats = cache.stats()
        assert stats.hits == 1
        assert stats.misses == 2
        assert stats.hit_rate == pytest.approx(33.33, abs=0.1)
        assert stats.miss_rate == pytest.approx(66.67, abs=0.1)

    def test_eviction_stats(self):
        """Test eviction tracking."""
        config = CacheConfig(max_size=2)
        cache = InMemoryCache(config)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # Causes eviction

        stats = cache.stats()
        assert stats.evictions == 1

    def test_thread_safety(self):
        """Test thread-safe concurrent access."""
        cache = InMemoryCache()
        errors = []

        def worker(thread_id: int):
            try:
                for i in range(100):
                    key = f"thread{thread_id}_key{i}"
                    cache.set(key, f"value{i}")
                    assert cache.get(key) == f"value{i}"
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread safety errors: {errors}"
        stats = cache.stats()
        assert stats.hits == 500  # 5 threads * 100 gets


class TestTTLCache:
    """Tests for TTLCache implementation."""

    def test_requires_default_ttl(self):
        """Test that TTLCache requires default_ttl_seconds."""
        config = CacheConfig()
        with pytest.raises(ValueError, match="default_ttl_seconds"):
            TTLCache(config)

    def test_ttl_expiration(self):
        """Test TTL-based expiration."""
        config = CacheConfig(default_ttl_seconds=0.1)
        cache = TTLCache(config)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        time.sleep(0.15)
        assert cache.get("key1") is None

    def test_custom_ttl_override(self):
        """Test per-entry TTL override."""
        config = CacheConfig(default_ttl_seconds=1.0)
        cache = TTLCache(config)
        cache.set("key1", "value1", ttl_seconds=0.1)
        assert cache.get("key1") == "value1"
        time.sleep(0.15)
        assert cache.get("key1") is None

    def test_refresh_callback_on_expire(self):
        """Test automatic refresh via callback."""
        config = CacheConfig(default_ttl_seconds=0.1)
        refresh_count = [0]

        def refresh(key: str) -> str:
            refresh_count[0] += 1
            return f"refreshed_{key}"

        cache = TTLCache(config, refresh_callback=refresh)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        time.sleep(0.15)
        # On expire, callback is called
        assert cache.get("key1") == "refreshed_key1"
        assert refresh_count[0] == 1

    def test_refresh_callback_failure(self):
        """Test handling of refresh callback failure."""
        config = CacheConfig(default_ttl_seconds=0.1)

        def failing_refresh(key: str) -> str:
            raise ValueError("Refresh failed")

        cache = TTLCache(config, refresh_callback=failing_refresh)
        cache.set("key1", "value1")
        time.sleep(0.15)
        # Should return None when refresh fails
        assert cache.get("key1") is None

    def test_size_limit(self):
        """Test size limit enforcement."""
        config = CacheConfig(max_size=2, default_ttl_seconds=10.0)
        cache = TTLCache(config)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # Should be dropped

        stats = cache.stats()
        assert stats.total_size <= 2
        assert stats.evictions == 1


class TestLRUCache:
    """Tests for LRU cache implementation."""

    def test_requires_max_size(self):
        """Test that LRUCache requires max_size."""
        config = CacheConfig()
        with pytest.raises(ValueError, match="max_size"):
            LRUCache(config)

    def test_lru_eviction(self):
        """Test LRU eviction when full."""
        config = CacheConfig(max_size=2)
        cache = LRUCache(config)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        assert cache.get("key1") is not None  # Access key1, making it recent

        cache.set("key3", "value3")  # key2 is least recent, should be evicted
        assert cache.get("key1") == "value1"
        assert cache.get("key2") is None
        assert cache.get("key3") == "value3"

    def test_access_updates_recency(self):
        """Test that get() updates recency."""
        config = CacheConfig(max_size=2)
        cache = LRUCache(config)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.get("key1")  # Access key1, making it most recent

        cache.set("key3", "value3")  # key2 should be evicted
        assert cache.get("key1") == "value1"
        assert cache.get("key2") is None

    def test_update_refreshes_position(self):
        """Test that set() on existing key updates position."""
        config = CacheConfig(max_size=2)
        cache = LRUCache(config)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key1", "updated_value1")  # Update key1

        cache.set("key3", "value3")  # key2 should be evicted
        assert cache.get("key1") == "updated_value1"
        assert cache.get("key2") is None

    def test_o1_operations(self):
        """Test O(1) operation time complexity."""
        config = CacheConfig(max_size=10000)
        cache = LRUCache(config)

        # Populate cache
        for i in range(10000):
            cache.set(f"key{i}", f"value{i}")

        # Measure get() time for first and last entry
        start = time.time()
        for _ in range(1000):
            cache.get("key0")
            cache.get("key9999")
        elapsed = time.time() - start

        # Should be very fast (< 100ms for 2000 gets)
        assert elapsed < 0.1, f"O(1) operations too slow: {elapsed}s"

    def test_eviction_stats(self):
        """Test eviction statistics."""
        config = CacheConfig(max_size=2)
        cache = LRUCache(config)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # Eviction
        cache.set("key4", "value4")  # Eviction

        stats = cache.stats()
        assert stats.evictions == 2


class TestHybridCache:
    """Tests for HybridCache implementation."""

    def test_default_l1_cache(self):
        """Test that HybridCache creates default InMemoryCache."""
        config = CacheConfig()
        cache = HybridCache(config)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

    def test_custom_l1_cache(self):
        """Test HybridCache with custom L1 cache."""
        config = CacheConfig(max_size=2)
        l1 = LRUCache(config)
        cache = HybridCache(config, l1_cache=l1)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # LRU eviction

        assert cache.get("key1") is None  # Evicted by LRU
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"

    def test_delete_propagates(self):
        """Test that delete removes from L1."""
        config = CacheConfig()
        cache = HybridCache(config)
        cache.set("key1", "value1")
        assert cache.delete("key1") is True
        assert cache.get("key1") is None

    def test_clear_propagates(self):
        """Test that clear removes from L1."""
        config = CacheConfig()
        cache = HybridCache(config)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None


class TestCacheStats:
    """Tests for CacheStats dataclass."""

    def test_hit_rate_calculation(self):
        """Test hit rate calculation."""
        stats = CacheStats(hits=70, misses=30)
        assert stats.hit_rate == pytest.approx(70.0)
        assert stats.miss_rate == pytest.approx(30.0)

    def test_zero_requests(self):
        """Test stats with zero requests."""
        stats = CacheStats(hits=0, misses=0)
        assert stats.hit_rate == 0.0
        assert stats.miss_rate == 100.0

    def test_all_hits(self):
        """Test stats with all hits."""
        stats = CacheStats(hits=100, misses=0)
        assert stats.hit_rate == 100.0
        assert stats.miss_rate == 0.0


class TestProductionScenarios:
    """Integration tests for production use cases."""

    def test_weather_prediction_cache(self):
        """Simulate caching weather predictions (short TTL)."""
        config = CacheConfig(
            max_size=1000,
            default_ttl_seconds=3600,  # 1 hour
        )
        cache = InMemoryCache(config)

        # Simulate 1000 weather predictions
        for tenant_id in range(100):
            for day in range(10):
                key = f"weather_{tenant_id}_{day}"
                weather_data = {
                    "temp": 72.5,
                    "humidity": 65.0,
                    "precipitation": 0.2,
                }
                cache.set(key, weather_data)

        # Verify all cached
        assert cache.stats().total_size == 1000

        # Verify retrieval
        assert cache.get("weather_0_0") is not None
        assert cache.stats().hits == 1

    def test_model_cache_lru_eviction(self):
        """Simulate LRU model caching for multi-tenant."""
        config = CacheConfig(max_size=50)  # Only 50 models in memory
        cache = LRUCache(config)

        # "Train" models for 100 tenants
        for tenant_id in range(100):
            model_key = f"model_{tenant_id}"
            model_data = {"weights": [0.1] * 100, "version": 1}
            cache.set(model_key, model_data)

        # Verify LRU eviction kept only 50 most recent
        stats = cache.stats()
        assert stats.total_size == 50
        assert stats.evictions == 50

    def test_weather_model_prediction_hybrid(self):
        """Simulate hybrid cache for weather+model predictions."""
        config = CacheConfig(max_size=500)
        l1 = LRUCache(config)
        cache = HybridCache(config, l1_cache=l1)

        # Cache predictions for 10 active tenants, 50 features each
        for tenant_id in range(10):
            for feature_id in range(50):
                key = f"prediction_{tenant_id}_{feature_id}"
                prediction = {"value": 100.5, "confidence": 0.95}
                cache.set(key, prediction)

        # Access patterns (some tenants accessed more frequently)
        for _ in range(10):
            for feature_id in range(50):
                cache.get(f"prediction_0_{feature_id}")  # Hot tenant

        stats = cache.stats()
        assert stats.hits == 500  # 10 iterations * 50 features
        assert stats.total_size == 500  # All fit in cache

    def test_refresh_callback_weather_update(self):
        """Simulate auto-refresh for weather data."""
        config = CacheConfig(default_ttl_seconds=0.2)
        refresh_calls = []

        def weather_refresh(key: str) -> dict:
            refresh_calls.append(key)
            tenant_id = key.split("_")[1]
            return {
                "temp": 72.5,
                "humidity": 65.0,
                "timestamp": time.time(),
                "tenant": tenant_id,
            }

        cache = TTLCache(config, refresh_callback=weather_refresh)

        # Set initial value
        cache.set("weather_001", {"temp": 70.0, "humidity": 60.0})
        initial = cache.get("weather_001")
        assert initial["temp"] == 70.0

        # Wait for expiration
        time.sleep(0.25)

        # Get refreshed value
        refreshed = cache.get("weather_001")
        assert refreshed["temp"] == 72.5
        assert "weather_001" in refresh_calls
