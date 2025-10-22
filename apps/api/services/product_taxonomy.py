from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Iterable, List, Sequence, Set, Tuple

from shared.libs.tagging.text import TextTagger
from shared.schemas.product_taxonomy import ProductSourceRecord, ProductTaxonomyEntry
from shared.services.product_taxonomy import (
    AFFINITY_SEASONALITY,
    ProductTaxonomyClassifier,
    ProductTaxonomyLLMResult,
)

logger = logging.getLogger(__name__)


_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "general"


class TaxonomyRule:
    """Keyword heuristic describing a canonical product taxonomy bucket."""

    __slots__ = (
        "category_l1",
        "category_l2",
        "weather_affinity",
        "seasonality",
        "patterns",
        "hints",
        "weight",
        "rule_id",
    )

    def __init__(
        self,
        *,
        rule_id: str,
        category_l1: str,
        category_l2: str,
        weather_affinity: str,
        seasonality: str | None = None,
        patterns: Sequence[Sequence[str]],
        hints: Sequence[str] | None = None,
        weight: int = 1,
    ) -> None:
        self.rule_id = rule_id
        self.category_l1 = category_l1
        self.category_l2 = category_l2
        self.weather_affinity = weather_affinity
        self.seasonality = seasonality or AFFINITY_SEASONALITY.get(
            weather_affinity, "evergreen"
        )
        self.patterns: Tuple[Tuple[str, ...], ...] = tuple(tuple(pattern) for pattern in patterns)
        self.hints: Tuple[str, ...] = tuple(hints or ())
        self.weight = weight

    def match(self, tokens: Set[str]) -> Tuple[int, Set[str]]:
        """Return (score, matched_tokens) when the rule applies."""
        matched_tokens: Set[str] = set()
        score = 0
        for pattern in self.patterns:
            if all(token in tokens for token in pattern):
                matched_tokens.update(pattern)
                score += len(pattern) + self.weight
        if score == 0:
            return 0, set()
        for hint in self.hints:
            if hint in tokens:
                matched_tokens.add(hint)
                score += 1
        return score, matched_tokens


CATEGORY_RULES: Tuple[TaxonomyRule, ...] = (
    TaxonomyRule(
        rule_id="outerwear_coats_winter",
        category_l1="outerwear",
        category_l2="coats",
        weather_affinity="winter",
        patterns=[["coat"], ["parka"], ["puffer"], ["insulated", "jacket"]],
        hints=["down", "thermal", "fleece"],
        weight=3,
    ),
    TaxonomyRule(
        rule_id="outerwear_jackets_winter",
        category_l1="outerwear",
        category_l2="jackets",
        weather_affinity="winter",
        patterns=[["jacket"], ["anorak"], ["shell"]],
        hints=["fleece", "softshell"],
        weight=2,
    ),
    TaxonomyRule(
        rule_id="outerwear_rain_jackets",
        category_l1="outerwear",
        category_l2="rain_jackets",
        weather_affinity="rain",
        patterns=[["rain", "jacket"], ["waterproof", "jacket"], ["raincoat"]],
        hints=["taped", "seam", "storm"],
        weight=4,
    ),
    TaxonomyRule(
        rule_id="footwear_rain_boots",
        category_l1="footwear",
        category_l2="rain_boots",
        weather_affinity="rain",
        patterns=[["rain", "boot"], ["galosh"], ["wellies"]],
        hints=["waterproof", "rubber"],
        weight=4,
    ),
    TaxonomyRule(
        rule_id="footwear_winter_boots",
        category_l1="footwear",
        category_l2="winter_boots",
        weather_affinity="winter",
        patterns=[["snow", "boot"], ["winter", "boot"], ["insulated", "boot"]],
        hints=["shearling", "thermal"],
        weight=3,
    ),
    TaxonomyRule(
        rule_id="accessories_gloves",
        category_l1="accessories",
        category_l2="gloves",
        weather_affinity="winter",
        patterns=[["glove"], ["mittens"]],
        hints=["thermal", "insulated"],
        weight=2,
    ),
    TaxonomyRule(
        rule_id="accessories_umbrellas",
        category_l1="accessories",
        category_l2="umbrellas",
        weather_affinity="rain",
        patterns=[["umbrella"], ["parasol"]],
        hints=["compact", "auto"],
        weight=3,
    ),
    TaxonomyRule(
        rule_id="apparel_swimwear",
        category_l1="apparel",
        category_l2="swimwear",
        weather_affinity="summer",
        patterns=[["swim"], ["bikini"], ["boardshort"], ["trunk"]],
        hints=["uv", "chlorine"],
        weight=4,
    ),
    TaxonomyRule(
        rule_id="apparel_tshirts",
        category_l1="apparel",
        category_l2="tshirts",
        weather_affinity="summer",
        patterns=[["tshirt"], ["tee"]],
        hints=["cotton", "lightweight"],
        weight=1,
    ),
    TaxonomyRule(
        rule_id="accessories_sunscreen",
        category_l1="accessories",
        category_l2="sunscreen",
        weather_affinity="heat",
        patterns=[["sunscreen"], ["sunblock"], ["spf"]],
        hints=["uv", "spf50", "protect"],
        weight=5,
    ),
    TaxonomyRule(
        rule_id="home_cooling",
        category_l1="home",
        category_l2="cooling",
        weather_affinity="heat",
        patterns=[["fan"], ["cooling"], ["air", "conditioner"]],
        hints=["portable", "evaporative"],
        weight=3,
    ),
    TaxonomyRule(
        rule_id="home_heating",
        category_l1="home",
        category_l2="heating",
        weather_affinity="winter",
        patterns=[["heater"], ["space", "heater"], ["radiant"]],
        hints=["ceramic", "infrared"],
        weight=3,
    ),
)


def _tokenize(text: str) -> List[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _seasonality_for_affinity(affinity: str) -> str:
    return AFFINITY_SEASONALITY.get(affinity, "evergreen")


def _seasonality_for_rule(rule: TaxonomyRule | None) -> str:
    if rule is None:
        return _seasonality_for_affinity("neutral")
    return rule.seasonality or _seasonality_for_affinity(rule.weather_affinity)


def _collect_unique(values: Iterable[str | None]) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for value in values:
        if not value:
            continue
        normalized = value.strip()
        if not normalized:
            continue
        if normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)
    return ordered


def _normalize_brand(value: str | None) -> str | None:
    if not value:
        return None
    slug = _slug(value)
    return slug or None


@dataclass
class ProductTaxonomyService:
    """Derives product taxonomy classifications from multi-source product metadata."""

    tagger: TextTagger = field(default_factory=TextTagger)
    logger: logging.Logger = field(default=logger)
    classifier: ProductTaxonomyClassifier | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.classifier is None:
            self.classifier = ProductTaxonomyClassifier(logger=self.logger)

    def classify(self, records: Iterable[ProductSourceRecord]) -> List[ProductTaxonomyEntry]:
        buckets = self._group_records(records)
        results: List[ProductTaxonomyEntry] = []
        for grouped_records in buckets.values():
            results.append(self._classify_group(grouped_records))
        return results

    def _group_records(
        self, records: Iterable[ProductSourceRecord]
    ) -> dict[tuple[str, str], list[ProductSourceRecord]]:
        buckets: dict[tuple[str, str], list[ProductSourceRecord]] = defaultdict(list)
        for record in records:
            buckets[(record.tenant_id, record.canonical_product_id)].append(record)
        return buckets

    def _classify_group(self, records: Sequence[ProductSourceRecord]) -> ProductTaxonomyEntry:
        if not records:
            raise ValueError("Cannot classify an empty record group")

        token_set, token_counts, combined_text = self._combined_tokens(records)
        rule, score, matched_tokens = self._match_rule(token_set)
        llm_result = self._classify_with_llm(records, combined_text)

        category_l1 = rule.category_l1 if rule else "general"
        category_l2 = rule.category_l2 if rule else "general"
        weather_affinity = rule.weather_affinity if rule else "neutral"
        seasonality = _seasonality_for_rule(rule)

        if llm_result:
            category_l1 = llm_result.category_l1
            category_l2 = llm_result.category_l2
            weather_affinity = llm_result.weather_affinity
            seasonality = llm_result.seasonality

        product_name = self._resolve_product_name(records, category_l2)
        brand_ids = sorted(
            {
                brand_slug
                for brand_slug in (
                    _normalize_brand(record.brand) or _normalize_brand(record.vendor)
                    for record in records
                )
                if brand_slug
            }
        )
        cross_brand_key = self._build_cross_brand_key(category_l2, weather_affinity, token_counts)
        sources = sorted({record.source for record in records})
        product_ids = sorted({record.product_id for record in records})

        weather_tags = self.tagger.suggest_weather_tags(combined_text)
        season_tags = self.tagger.suggest_season_tags(combined_text)

        evidence = {
            "matched_rule": getattr(rule, "rule_id", None),
            "matched_tokens": sorted(matched_tokens),
            "weather_tags": weather_tags,
            "season_tags": season_tags,
            "raw_titles": _collect_unique(record.title for record in records),
            "raw_categories": _collect_unique(record.category for record in records),
            "raw_tags": sorted({tag for record in records for tag in record.tags}),
            "raw_brands": _collect_unique(record.brand for record in records)
            or _collect_unique(record.vendor for record in records),
        }

        if llm_result:
            evidence["llm_reasoning"] = llm_result.reasoning
            evidence["llm_confidence"] = llm_result.confidence
            evidence["llm_model"] = llm_result.model
            evidence["llm_payload"] = llm_result.raw_payload

        confidence = max(self._confidence(score, token_counts), llm_result.confidence if llm_result else 0.0)

        exemplar = records[0]
        return ProductTaxonomyEntry(
            tenant_id=exemplar.tenant_id,
            canonical_product_id=exemplar.canonical_product_id,
            product_name=product_name,
            category_l1=category_l1,
            category_l2=category_l2,
            weather_affinity=weather_affinity,
            seasonality=seasonality,
            cross_brand_key=cross_brand_key,
            product_ids=product_ids,
            brand_ids=brand_ids,
            sources=sources,
            confidence=confidence,
            evidence=evidence,
        )

    def _classify_with_llm(
        self, records: Sequence[ProductSourceRecord], combined_text: str
    ) -> ProductTaxonomyLLMResult | None:
        if not self.classifier:
            return None
        try:
            return self.classifier.classify(records, combined_text=combined_text)
        except Exception:  # pragma: no cover - defensive logging path
            self.logger.exception("LLM-driven taxonomy classification failed")
            return None

    def _combined_tokens(
        self, records: Sequence[ProductSourceRecord]
    ) -> tuple[Set[str], Counter[str], str]:
        components: List[str] = []
        for record in records:
            components.extend(
                filter(
                    None,
                    [
                        record.product_name,
                        record.title,
                        record.category,
                        record.subcategory,
                        record.description,
                        record.vendor,
                        record.brand,
                        " ".join(record.tags) if record.tags else None,
                    ],
                )
            )
        combined_text = " ".join(components)
        tokens = _tokenize(combined_text)
        return set(tokens), Counter(tokens), combined_text

    def _match_rule(self, tokens: Set[str]) -> tuple[TaxonomyRule | None, int, Set[str]]:
        best_rule: TaxonomyRule | None = None
        best_score = 0
        best_tokens: Set[str] = set()
        for rule in CATEGORY_RULES:
            score, matched = rule.match(tokens)
            if score == 0:
                continue
            if score > best_score or (score == best_score and best_rule and rule.weight > best_rule.weight):
                best_rule = rule
                best_score = score
                best_tokens = matched
        return best_rule, best_score, best_tokens

    def _resolve_product_name(
        self, records: Sequence[ProductSourceRecord], fallback_category: str
    ) -> str:
        for record in records:
            if record.product_name:
                return record.product_name
            if record.title:
                return record.title
        return fallback_category.title()

    def _confidence(self, score: int, token_counts: Counter[str]) -> float:
        if score >= 8:
            return 0.95
        if score >= 6:
            return 0.9
        if score >= 4:
            return 0.82
        if score >= 3:
            return 0.75
        if score >= 2:
            return 0.68
        if score == 1:
            return 0.6
        distinct_tokens = len(token_counts)
        if distinct_tokens > 8:
            return 0.55
        if distinct_tokens > 4:
            return 0.5
        return 0.45

    def _build_cross_brand_key(
        self, category_l2: str, weather_affinity: str, token_counts: Counter[str]
    ) -> str:
        tokens = set(token_counts)
        modifiers: List[str] = []
        if tokens & {"mens", "men", "male"}:
            modifiers.append("mens")
        elif tokens & {"womens", "women", "female"}:
            modifiers.append("womens")
        elif tokens & {"kids", "kid", "youth", "child"}:
            modifiers.append("kids")

        if tokens & {"plus", "curvy"}:
            modifiers.append("plus")
        if tokens & {"petite"}:
            modifiers.append("petite")

        base_parts = [_slug(category_l2), _slug(weather_affinity)]
        base_parts.extend(modifiers)

        if len(base_parts) < 3:
            descriptive = [
                token
                for token, count in token_counts.most_common(4)
                if token not in {"the", "and", "with", "for", "sale"}
                and len(token) > 2
            ]
            for token in descriptive:
                if token not in base_parts:
                    base_parts.append(token)
                if len(base_parts) >= 3:
                    break

        filtered = [part for part in base_parts if part]
        return "_".join(filtered) if filtered else "general_neutral"
