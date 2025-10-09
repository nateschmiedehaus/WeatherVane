from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, List

WEATHER_KEYWORDS = {
    "rain": "Rain",
    "storm": "Storm",
    "snow": "Snow",
    "heat": "Heat",
    "sun": "UV",
    "cold": "Cold",
    "wind": "Wind",
    "humidity": "Humidity",
    "pollen": "Pollen",
    "smoke": "AQI",
    "allergy": "Pollen",
}

SEASON_KEYWORDS = {
    "summer": "Summer",
    "winter": "Winter",
    "spring": "Spring",
    "fall": "Fall",
    "autumn": "Fall",
}

INTENT_KEYWORDS = {
    "new": "Prospecting",
    "sale": "Remarketing",
    "bundle": "Cross-sell",
    "loyal": "Loyalty",
}


@dataclass
class TextTagger:
    """Lightweight keyword-based tagger placeholder.

    The production implementation should back this with sentence-transformers
    embeddings and cosine similarity. This version provides heuristics so the
    catalog tagging UI can evolve without blocking on ML ops.
    """

    weather_keywords: dict[str, str] = field(default_factory=lambda: dict(WEATHER_KEYWORDS))
    season_keywords: dict[str, str] = field(default_factory=lambda: dict(SEASON_KEYWORDS))
    intent_keywords: dict[str, str] = field(default_factory=lambda: dict(INTENT_KEYWORDS))

    def suggest_weather_tags(self, text: str) -> List[str]:
        tokens = self._tokenize(text)
        tags = {label for token in tokens if (label := self.weather_keywords.get(token))}
        return sorted(tags)

    def suggest_season_tags(self, text: str) -> List[str]:
        tokens = self._tokenize(text)
        tags = {label for token in tokens if (label := self.season_keywords.get(token))}
        return sorted(tags)

    def suggest_intent_tags(self, text: str) -> List[str]:
        tokens = self._tokenize(text)
        tags = {label for token in tokens if (label := self.intent_keywords.get(token))}
        return sorted(tags)

    def _tokenize(self, text: str) -> Iterable[str]:
        return re.findall(r"[a-z]+", text.lower())
