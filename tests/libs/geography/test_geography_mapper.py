"""Test suite for geographic mapping with DMA-first hierarchical fallback."""

import pytest
from pathlib import Path
from shapely.geometry import Point, Polygon

from shared.libs.geography.mapper import GeographyMapper, GeographyResolution


@pytest.fixture
def mock_crosswalk_data(tmp_path: Path) -> Path:
    """Create a mock DMA crosswalk file."""
    crosswalk = tmp_path / "dma_county_crosswalk.csv"
    crosswalk.write_text("""state_abbr,state_fips,county_fips,county_name,dma_code,dma_name
CA,06,06075,San Francisco,807,San Francisco-Oakland-San Jose
NY,36,36061,New York,501,New York
""")
    return crosswalk


@pytest.fixture
def mock_county_geometry(tmp_path: Path) -> Path:
    """Create a mock county geometry file."""
    geojson = tmp_path / "counties.geojson"
    geojson.write_text("""{
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [[
              [-122.419, 37.775],
              [-122.419, 37.785],
              [-122.409, 37.785],
              [-122.409, 37.775],
              [-122.419, 37.775]
            ]]
          },
          "properties": {
            "STATE": "CA",
            "NAME": "San Francisco"
          },
          "id": "06075"
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [[
              [-74.006, 40.712],
              [-74.006, 40.722],
              [-73.996, 40.722],
              [-73.996, 40.712],
              [-74.006, 40.712]
            ]]
          },
          "properties": {
            "STATE": "NY",
            "NAME": "New York"
          },
          "id": "36061"
        }
      ]
    }""")
    return geojson


def test_init_with_missing_files(tmp_path: Path):
    """Test that GeographyMapper raises error with missing files."""
    fake_path = tmp_path / "does_not_exist"

    with pytest.raises(FileNotFoundError, match="DMA crosswalk not found"):
        GeographyMapper(crosswalk_path=fake_path)


def test_lookup_nonexistent_geohash(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test that invalid geohash returns global scope."""
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry
    )

    result = mapper.lookup("invalid")
    assert result.level == "global"
    assert result.scope == "GLOBAL"
    assert result.fallback_reason == "no_geographic_match"


def test_lookup_sf_dma_success(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test successful DMA resolution for San Francisco."""
    # SF geohash: 9q8yykc (Civic Center)
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry,
        geocoded_ratio=0.6,  # Above DMA threshold
        weather_coverage=0.9  # Above DMA threshold
    )

    result = mapper.lookup("9q8yykc")
    assert result.level == "dma"
    assert result.scope == "DMA:807"
    assert result.dma_name == "San Francisco-Oakland-San Jose"
    assert result.state_abbr == "CA"
    assert result.county_fips == "06075"
    assert result.geocoded_ratio == 0.6
    assert result.weather_coverage == 0.9
    assert result.fallback_reason is None


def test_lookup_ny_dma_low_coverage(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test DMA to state fallback due to low weather coverage."""
    # NYC geohash: dr5reg (Manhattan)
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry,
        geocoded_ratio=0.6,  # Above DMA threshold
        weather_coverage=0.7  # Below DMA threshold
    )

    result = mapper.lookup("dr5reg")
    assert result.level == "state"
    assert result.scope == "STATE:NY"
    assert result.state_abbr == "NY"
    assert result.geocoded_ratio == 0.6
    assert result.weather_coverage == 0.7
    assert result.fallback_reason == "dma_weather_coverage_below_threshold"


def test_lookup_sf_state_low_geocoding(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test DMA to state fallback due to low geocoding ratio."""
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry,
        geocoded_ratio=0.2,  # Below DMA threshold
        weather_coverage=0.9  # Above DMA threshold
    )

    result = mapper.lookup("9q8yykc")
    assert result.level == "state"
    assert result.scope == "STATE:CA"
    assert result.state_abbr == "CA"
    assert result.geocoded_ratio == 0.2
    assert result.weather_coverage == 0.9
    assert result.fallback_reason == "dma_geocoded_ratio_below_threshold"


def test_lookup_state_level_fallbacks(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test state to global fallback with low coverage."""
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry,
        geocoded_ratio=0.2,  # Below state threshold
        weather_coverage=0.6  # Below state threshold
    )

    result = mapper.lookup("9q8yykc")
    assert result.level == "global"
    assert result.scope == "GLOBAL"
    assert result.geocoded_ratio == 0.2
    assert result.weather_coverage == 0.6
    assert result.fallback_reason == "state_geocoded_ratio_below_threshold"


def test_cache_behavior(mock_crosswalk_data: Path, mock_county_geometry: Path):
    """Test that results are cached and reused."""
    mapper = GeographyMapper(
        crosswalk_path=mock_crosswalk_data,
        county_geometry_path=mock_county_geometry,
        geocoded_ratio=0.6,
        weather_coverage=0.9
    )

    # First lookup should cache the result
    result1 = mapper.lookup("9q8yykc")
    assert result1.level == "dma"

    # Modify internal cache ratio (not recommended in practice)
    mapper._geocoded_ratio = 0.1

    # Second lookup should return cached result with original ratio
    result2 = mapper.lookup("9q8yykc")
    assert result2.level == "dma"
    assert result2.geocoded_ratio == 0.6  # Original ratio from cache