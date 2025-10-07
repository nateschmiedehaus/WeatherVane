from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ConnectorConfig:
    timeout: float = 30.0
    max_retries: int = 3


@dataclass(slots=True)
class ShopifyConfig(ConnectorConfig):
    shop_domain: str = ""
    access_token: str = ""
    api_version: str = "2024-04"


@dataclass(slots=True)
class MetaAdsConfig(ConnectorConfig):
    access_token: str = ""
    app_id: str = ""
    app_secret: str = ""
    graph_version: str = "v19.0"


@dataclass(slots=True)
class GoogleAdsConfig(ConnectorConfig):
    developer_token: str = ""
    client_id: str = ""
    client_secret: str = ""
    refresh_token: str = ""
    login_customer_id: str | None = None


@dataclass(slots=True)
class KlaviyoConfig(ConnectorConfig):
    api_key: str = ""


@dataclass(slots=True)
class WeatherConfig(ConnectorConfig):
    base_url: str = "https://api.open-meteo.com/v1"
