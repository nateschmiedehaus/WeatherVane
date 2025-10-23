#!/usr/bin/env python3
"""Build a DMA-by-county crosswalk for the geography mapper."""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "shared" / "data" / "geography"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_PATH = DATA_DIR / "dma_county_crosswalk.csv"

DMA_INFO_URL = "https://raw.githubusercontent.com/simzou/nielsen-dma/master/tv.json"
FIPS_LOOKUP_URL = (
    "https://raw.githubusercontent.com/alex-patton/US-TVDMA-BY-COUNTY/master/FIPS_StateCounty_Code.csv"
)
STATE_FILES = [
    "al",
    "ak",
    "az",
    "ar",
    "ca",
    "co",
    "ct",
    "de",
    "dc",
    "fl",
    "ga",
    "hi",
    "ia",
    "id",
    "il",
    "in",
    "ks",
    "ky",
    "la",
    "ma",
    "md",
    "me",
    "mi",
    "mn",
    "mo",
    "ms",
    "mt",
    "nc",
    "nd",
    "ne",
    "nh",
    "nj",
    "nm",
    "nv",
    "ny",
    "oh",
    "ok",
    "or",
    "pa",
    "ri",
    "sc",
    "sd",
    "tn",
    "tx",
    "ut",
    "va",
    "vt",
    "wa",
    "wi",
    "wv",
    "wy",
]
DMA_LABEL_OVERRIDES = {
    "Tucson (Nogales), AZ DMA": "Tucson (Sierra Vista)",
    "Idaho Falls - Pocatello, ID - WY DMA": "Idaho Fals-Pocatllo(Jcksn)",
    "Sacramento - Stockton - Modesto, CA DMA": "Sacramnto-Stkton-Modesto",
    "Santa Barbara - Santa Maria - San Luis Obispo, CA DMA": "SantaBarbra-SanMar-SanLuOb",
}
COUNTY_ALIASES = {
    ("AK", "ANCHORAGE BOR. 3"): "ANCHORAGE",
    ("AK", "DENALI BOR. 6"): "DENALI",
    ("AK", "FAIRBANKS NO.STAR BOR8."): "FAIRBANKS NORTH STAR",
    ("AK", "JUNEAU BOR. 10"): "JUNEAU",
    ("AK", "KENAI PENINSULA BOR. 11"): "KENAI PENINSULA",
    ("AK", "MATANUSKA-SUSITNA B1O5"): "MATANUSKA-SUSITNA",
    ("AK", "SOUTHEAST FRBKS. C.A 22"): "SOUTHEAST FAIRBANKS",
    ("FL", "DADE"): "MIAMI-DADE",
    ("LA", "ST JOHN THE BAP"): "ST JOHN THE BAPTIST",
    ("MD", "BALTIMORE CITY"): "BALTIMORE",
    ("MN", "LAKE OF WOODS"): "LAKE OF THE WOODS",
    ("MO", "ST LOUIS CITY"): "ST. LOUIS",
    ("VA", "BEDFORD CITY"): "BEDFORD",
    ("VA", "FAIRFAX CITY"): "FAIRFAX",
    ("VA", "FRANKLIN CITY"): "FRANKLIN",
    ("VA", "RICHMOND CITY"): "RICHMOND",
    ("VA", "ROANOKE CITY"): "ROANOKE",
    ("VA", "SOUTH BOSTON"): "HALIFAX",
}


@dataclass
class DmaRecord:
    code: str
    name: str
    full_label: str


def _canonical(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _load_dma_directory() -> dict[str, DmaRecord]:
    response = requests.get(DMA_INFO_URL, timeout=30)
    response.raise_for_status()
    payload = json.loads(response.text)

    directory: dict[str, DmaRecord] = {}
    for code, meta in payload.items():
        name = str(meta.get("Designated Market Area (DMA)", "")).strip()
        if not name:
            continue
        directory[name] = DmaRecord(code=str(code).strip(), name=name, full_label=name)
    return directory


def _canonical_county_name(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", value.upper())


def _load_fips_lookup() -> dict[tuple[str, str], tuple[str, str]]:
    response = requests.get(FIPS_LOOKUP_URL, timeout=30)
    response.raise_for_status()
    lookup: dict[tuple[str, str], tuple[str, str]] = {}
    reader = csv.DictReader(response.text.splitlines())
    for row in reader:
        state_fips = str(row.get("STATEFP") or "").zfill(2)
        county_fips = str(row.get("COUNTYFB") or "").zfill(3)
        county = str(row.get("COUNTY") or "").strip().upper()
        state_abbr = str(row.get("ST") or "").strip().upper()
        if not state_fips or not county or not state_abbr:
            continue
        lookup[(state_abbr, _canonical_county_name(county))] = (state_fips, county_fips)
    return lookup


def _match_dma(
    label: str,
    directory: dict[str, DmaRecord],
    canonical_index: dict[str, DmaRecord],
) -> DmaRecord | None:
    cleaned = label.strip().strip('"')
    if cleaned.lower().endswith(" dma"):
        cleaned = cleaned[:-4]
    cleaned = " ".join(cleaned.split())
    override_target = DMA_LABEL_OVERRIDES.get(label.strip())
    if override_target and override_target in directory:
        return directory[override_target]
    seen: set[str] = set()
    queue: list[str] = [cleaned]

    while queue:
        candidate = queue.pop()
        canonical = _canonical(candidate)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        if len(canonical) < 3:
            continue

        record = canonical_index.get(canonical)
        if record:
            return record

        for canon_value, stored_record in canonical_index.items():
            if canonical.startswith(canon_value) or canon_value.startswith(canonical):
                return stored_record

        for separator in ("-", ",", "/"):
            if separator in candidate:
                for part in candidate.split(separator):
                    part_clean = part.strip()
                    if part_clean and len(_canonical(part_clean)) >= 3:
                        queue.append(part_clean)

    return None


def _build_canonical_index(entries: Iterable[DmaRecord]) -> dict[str, DmaRecord]:
    index: dict[str, DmaRecord] = {}
    for record in entries:
        key = _canonical(record.name)
        if key and key not in index:
            index[key] = record
    return index


def main() -> None:
    dma_directory = _load_dma_directory()
    canonical_index = _build_canonical_index(dma_directory.values())
    fips_lookup = _load_fips_lookup()

    unmatched: dict[str, int] = defaultdict(int)
    results: list[dict[str, str]] = []

    for state in STATE_FILES:
        url = f"https://raw.githubusercontent.com/alex-patton/US-TVDMA-BY-COUNTY/master/{state}_reg.csv"
        response = requests.get(url, timeout=30)
        if response.status_code == 404:
            continue
        response.raise_for_status()
        reader = csv.DictReader(response.text.splitlines())
        for row in reader:
            state_abbr = str(row.get("STATE_AB") or "").strip().upper()
            county_raw = str(row.get("COUNTY") or "").strip()
            county_name = county_raw.upper()
            label = str(row.get("TVDMA") or "").strip()
            if not state_abbr or not county_name or not label:
                continue

            dma_record = _match_dma(label, dma_directory, canonical_index)
            if dma_record is None:
                unmatched[label] += 1
                continue

            alias = COUNTY_ALIASES.get((state_abbr, county_name))
            lookup_name = alias.upper() if alias else county_name
            key = (state_abbr, _canonical_county_name(lookup_name))
            if key not in fips_lookup:
                unmatched[f"{state_abbr}:{county_name}"] += 1
                continue

            state_fips, county_fips = fips_lookup[key]
            results.append(
                {
                    "state_abbr": state_abbr,
                    "state_fips": state_fips,
                    "county_fips": f"{state_fips}{county_fips}",
                    "county_name": (alias or county_raw).title(),
                    "dma_code": dma_record.code,
                    "dma_name": dma_record.name,
                    "dma_label": label.strip().strip('"'),
                }
            )

    if unmatched:
        print("Warning: unmatched entries detected:")
        for label, count in sorted(unmatched.items(), key=lambda item: item[0]):
            print(f"  {label}: {count}")

    results.sort(key=lambda row: (row["state_fips"], row["county_fips"]))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "state_abbr",
                "state_fips",
                "county_fips",
                "county_name",
                "dma_code",
                "dma_name",
                "dma_label",
            ],
        )
        writer.writeheader()
        writer.writerows(results)

    print(f"Wrote {len(results)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
