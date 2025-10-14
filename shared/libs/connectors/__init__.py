"""Connector factory exports."""
from .base import Connector, HTTPConnector
from .config import (
    ConnectorConfig,
    GoogleAdsConfig,
    KlaviyoConfig,
    MetaAdsConfig,
    ShopifyConfig,
    WeatherConfig,
)
from .google_ads import GoogleAdsConnector
from .google_marketing import (
    GoogleAdsMarketingClient,
    GoogleCampaignBudgetSpec,
    GoogleCampaignSpec,
)
from .klaviyo import KlaviyoConnector
from .meta import MetaAdsConnector
from .meta_marketing import (
    MetaMarketingClient,
    CampaignSpec,
    AdSetSpec,
    CreativeSpec,
    AdSpec,
)
from .rate_limit import AsyncRateLimiter
from .registry import load_manifest, list_manifests, ConnectorRegistryError
from .sdk import (
    AuthMethod,
    Capability,
    ConnectorManifest,
    ConnectorPlugin,
    ConnectorMessage,
    RecordMessage,
    SecretField,
    StateMessage,
    StreamSchema,
    SyncConfig,
    SyncState,
)
from .shopify import ShopifyConnector
from .weather import WeatherConnector

__all__ = [
    "Connector",
    "HTTPConnector",
    "AsyncRateLimiter",
    "ConnectorConfig",
    "ShopifyConfig",
    "MetaAdsConfig",
    "GoogleAdsConfig",
    "KlaviyoConfig",
    "WeatherConfig",
    "GoogleAdsConnector",
    "KlaviyoConnector",
    "MetaAdsConnector",
    "GoogleAdsMarketingClient",
    "MetaMarketingClient",
    "ShopifyConnector",
    "WeatherConnector",
    "GoogleCampaignBudgetSpec",
    "GoogleCampaignSpec",
    "CampaignSpec",
    "AdSetSpec",
    "CreativeSpec",
    "AdSpec",
    "ConnectorPlugin",
    "ConnectorManifest",
    "StreamSchema",
    "SyncConfig",
    "SyncState",
    "SecretField",
    "RecordMessage",
    "StateMessage",
    "ConnectorMessage",
    "AuthMethod",
    "Capability",
    "load_manifest",
    "list_manifests",
    "ConnectorRegistryError",
]
