from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ConnectorConfig:
    timeout: float = 30.0
    max_retries: int = 3
    backoff_factor: float = 0.5
    max_backoff: float = 10.0
    rate_limit_per_second: float | None = None
    rate_limit_capacity: float | None = None


@dataclass(slots=True)
class ShopifyConfig(ConnectorConfig):
    shop_domain: str = ""
    access_token: str = ""
    api_version: str = "2024-04"
    client_id: str | None = None
    client_secret: str | None = None
    refresh_token: str | None = None

    def __post_init__(self) -> None:
        if self.rate_limit_per_second is None:
            self.rate_limit_per_second = 2.0
        if self.rate_limit_capacity is None:
            self.rate_limit_capacity = 40.0


@dataclass(slots=True)
class MetaAdsConfig(ConnectorConfig):
    access_token: str = ""
    app_id: str = ""
    app_secret: str = ""
    graph_version: str = "v19.0"

    def __post_init__(self) -> None:
        if self.rate_limit_per_second is None:
            self.rate_limit_per_second = 10.0
        if self.rate_limit_capacity is None:
            self.rate_limit_capacity = 20.0


@dataclass(slots=True)
class GoogleAdsConfig(ConnectorConfig):
    developer_token: str = ""
    client_id: str = ""
    client_secret: str = ""
    refresh_token: str = ""
    login_customer_id: str | None = None
    access_token: str | None = None
    api_version: str = "v14"
    token_uri: str = "https://oauth2.googleapis.com/token"

    def __post_init__(self) -> None:
        if self.rate_limit_per_second is None:
            self.rate_limit_per_second = 5.0
        if self.rate_limit_capacity is None:
            self.rate_limit_capacity = 10.0


@dataclass(slots=True)
class KlaviyoConfig(ConnectorConfig):
    api_key: str = ""


@dataclass(slots=True)
class WeatherConfig(ConnectorConfig):
    base_url: str = "https://api.open-meteo.com/v1"

    def __post_init__(self) -> None:
        if self.rate_limit_per_second is None:
            self.rate_limit_per_second = 5.0
        if self.rate_limit_capacity is None:
            self.rate_limit_capacity = 5.0
