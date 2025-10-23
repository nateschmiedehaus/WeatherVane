"""Caching strategies for WeatherVane weather and model prediction data.

This module provides production-grade caching abstractions for:
- Model loading and inference (weather-aware MMM)
- Weather predictions and features
- Real-time allocation decisions
- Feature store joins

Strategies supported:
- InMemoryCache: Fast, suitable for single-instance deployments
- TTLCache: Time-based expiration with refresh
- LRUCache: Least-recently-used eviction with configurable size
- HybridCache: Multi-tier (memory + optional disk/redis)
"""

from shared.libs.caching.strategy import (
    Cache,
    InMemoryCache,
    TTLCache,
    LRUCache,
    HybridCache,
    CacheConfig,
    CacheStats,
)

__all__ = [
    "Cache",
    "InMemoryCache",
    "TTLCache",
    "LRUCache",
    "HybridCache",
    "CacheConfig",
    "CacheStats",
]
