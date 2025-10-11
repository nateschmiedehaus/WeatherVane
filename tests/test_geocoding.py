import geohash2  # type: ignore

from apps.worker.ingestion.geocoding import GeoResult, Geocoder, enrich_order_with_geo
from shared.libs.storage.state import JsonStateStore


def test_enrich_order_with_geo_uses_existing_coordinates():
    class RecordingGeocoder:
        def __init__(self):
            self.lookup_calls = []
            self.lookup_city_calls = []
            self.precision = 5

        def lookup(self, postal_code, country=None):
            self.lookup_calls.append((postal_code, country))
            return GeoResult(latitude=None, longitude=None, geohash=None)

        def lookup_city(self, city, *, country=None, region=None):
            self.lookup_city_calls.append((city, country, region))
            return GeoResult(latitude=None, longitude=None, geohash=None)

    geocoder = RecordingGeocoder()
    order = {
        "shipping_address": {
            "latitude": "47.6205",
            "longitude": "-122.3493",
        },
    }

    enriched = enrich_order_with_geo(order, geocoder)  # type: ignore[arg-type]

    assert geocoder.lookup_calls == []
    assert geocoder.lookup_city_calls == []
    assert enriched["ship_latitude"] == 47.6205
    assert enriched["ship_longitude"] == -122.3493
    assert enriched["ship_geohash"] == geohash2.encode(47.6205, -122.3493, geocoder.precision)


def test_enrich_order_with_geo_city_fallback():
    class RecordingGeocoder:
        def __init__(self):
            self.lookup_calls = []
            self.lookup_city_calls = []

        def lookup(self, postal_code, country=None):
            self.lookup_calls.append((postal_code, country))
            return GeoResult(latitude=None, longitude=None, geohash=None)

        def lookup_city(self, city, *, country=None, region=None):
            self.lookup_city_calls.append((city, country, region))
            return GeoResult(latitude=47.0, longitude=-122.0, geohash="c23nb")

    geocoder = RecordingGeocoder()
    order = {
        "shipping_address": {"city": "Seattle", "province_code": "US-WA", "country_code": "US"},
    }

    enriched = enrich_order_with_geo(order, geocoder)  # type: ignore[arg-type]

    assert geocoder.lookup_calls == []
    assert geocoder.lookup_city_calls == [("Seattle", "US", "US-WA")]
    assert enriched["ship_latitude"] == 47.0
    assert enriched["ship_longitude"] == -122.0
    assert enriched["ship_geohash"] == "c23nb"


def test_enrich_order_with_geo_city_fallback_without_geohash():
    class RecordingGeocoder:
        def __init__(self):
            self.lookup_calls = []
            self.lookup_city_calls = []
            self.precision = 5

        def lookup(self, postal_code, country=None):
            self.lookup_calls.append((postal_code, country))
            return GeoResult(latitude=None, longitude=None, geohash=None)

        def lookup_city(self, city, *, country=None, region=None):
            self.lookup_city_calls.append((city, country, region))
            return GeoResult(latitude=47.60, longitude=-122.33, geohash=None)

    geocoder = RecordingGeocoder()
    order = {
        "shipping_address": {"city": "Seattle", "province_code": "US-WA", "country_code": "US"},
    }

    enriched = enrich_order_with_geo(order, geocoder)  # type: ignore[arg-type]

    assert geocoder.lookup_calls == []
    assert geocoder.lookup_city_calls == [("Seattle", "US", "US-WA")]
    assert enriched["ship_latitude"] == 47.60
    assert enriched["ship_longitude"] == -122.33
    assert enriched["ship_geohash"] == geohash2.encode(47.60, -122.33, geocoder.precision)


def test_geocoder_postal_cache_persists(tmp_path, monkeypatch):
    from apps.worker.ingestion import geocoding as geocoding_module

    calls: list[tuple[str, str, int]] = []

    def fake_lookup_postal(country: str, postal_code: str, precision: int) -> GeoResult:
        calls.append((country, postal_code, precision))
        return GeoResult(latitude=1.0, longitude=2.0, geohash="abc12")

    monkeypatch.setattr(geocoding_module, "_lookup_postal", fake_lookup_postal)
    store = JsonStateStore(root=tmp_path / "state")

    geocoder = Geocoder(state_store=store)
    first = geocoder.lookup("98052", "US")
    second = geocoder.lookup("98052", "US")

    assert first.geohash == "abc12"
    assert second is first  # cached object
    assert calls == [("US", "98052", geocoder.precision)]

    fresh = Geocoder(state_store=store)
    again = fresh.lookup("98052", "US")
    assert again.geohash == "abc12"
    assert calls == [("US", "98052", geocoder.precision)]


def test_geocoder_city_cache_and_region_variants(tmp_path, monkeypatch):
    from apps.worker.ingestion import geocoding as geocoding_module

    calls: list[tuple[str, str, tuple[str, ...], int]] = []

    def fake_lookup_city(country: str, city_key: str, regions: tuple[str, ...], precision: int) -> GeoResult:
        calls.append((country, city_key, regions, precision))
        assert country == "US"
        assert city_key == "seattle"
        assert "wa" in regions
        return GeoResult(latitude=47.6, longitude=-122.3, geohash="c23nb")

    monkeypatch.setattr(geocoding_module, "_lookup_city", fake_lookup_city)
    store = JsonStateStore(root=tmp_path / "state")
    geocoder = Geocoder(state_store=store)

    result = geocoder.lookup_city("Seattle", country="US", region="US-WA")
    repeat = geocoder.lookup_city("Seattle", country="US", region="US-WA")

    assert result.geohash == "c23nb"
    assert repeat is result
    assert calls == [("US", "seattle", ("us-wa", "wa", ""), geocoder.precision)]

    # Region variant should reuse cached value even if caller omits country prefix
    variant = geocoder.lookup_city("Seattle", country="US", region="WA")
    assert variant.geohash == "c23nb"
    assert len(calls) == 2  # new lookup for different key

    fresh = Geocoder(state_store=store)
    again = fresh.lookup_city("Seattle", country="US", region="US-WA")
    assert again.geohash == "c23nb"
