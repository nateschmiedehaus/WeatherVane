from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from shared.schemas.product_taxonomy import ProductSourceRecord

try:
    import anthropic  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    anthropic = None  # type: ignore

__all__ = [
    "AFFINITY_SEASONALITY",
    "ProductTaxonomyClassifier",
    "ProductTaxonomyLLMResult",
]

AFFINITY_SEASONALITY: Dict[str, str] = {
    "winter": "seasonal_q4_q1",
    "summer": "seasonal_q2_q3",
    "heat": "seasonal_q2_q3",
    "rain": "weather_triggered",
    "neutral": "evergreen",
}

VALID_WEATHER_AFFINITIES = frozenset(AFFINITY_SEASONALITY)

SYSTEM_PROMPT = (
    "You are a retail merchandising analyst. Classify catalog products into our "
    "canonical taxonomy so weather-aware models understand demand signals. "
    "Respond with strict JSON using keys: category_l1, category_l2, weather_affinity "
    "(one of winter, summer, rain, heat, neutral), seasonality, confidence (0-1), "
    "and reasoning. Prefer specific categories over generic ones. Base decisions on "
    "titles, tags, descriptions, and vendor context."
)

EXAMPLE_PROMPT = """### Example
Input:
source=shopify; title=Men's Arctic Down Parka; tags=['winter','parka','insulated']
Output:
{"category_l1":"outerwear","category_l2":"coats","weather_affinity":"winter","seasonality":"seasonal_q4_q1","confidence":0.92,"reasoning":"Heavy insulated parka designed for winter cold"}
"""

JSON_BLOCK_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class ProductTaxonomyLLMResult:
    category_l1: str
    category_l2: str
    weather_affinity: str
    seasonality: str
    confidence: float
    reasoning: str
    model: str
    raw_payload: Dict[str, Any]


@dataclass
class ProductTaxonomyClassifier:
    """
    LLM-backed classifier for product taxonomy with weather affinity labels.

    The classifier prefers an Anthropic Claude client when available, but callers
    can inject any object that exposes a ``messages.create`` method returning a
    response with textual content. When no client is provided the classifier
    simply returns ``None`` so upstream services can fall back to heuristics.
    """

    llm_client: Any | None = None
    model: str = "claude-3-haiku-20240307"
    temperature: float = 0.0
    max_output_tokens: int = 400
    logger: logging.Logger = field(default_factory=lambda: logging.getLogger(__name__))

    def __post_init__(self) -> None:
        if self.llm_client is None:
            client = self._build_default_client()
            if client is not None:
                self.llm_client = client

    def classify(
        self,
        records: Sequence[ProductSourceRecord],
        *,
        combined_text: str | None = None,
    ) -> Optional[ProductTaxonomyLLMResult]:
        if not records or self.llm_client is None:
            return None

        payload = self._classification_prompt(records, combined_text=combined_text)
        try:
            response = self.llm_client.messages.create(
                model=self.model,
                system=SYSTEM_PROMPT,
                temperature=self.temperature,
                max_output_tokens=self.max_output_tokens,
                messages=[{"role": "user", "content": payload}],
            )
        except Exception:  # pragma: no cover - network/SDK failure path
            self.logger.exception("Product taxonomy LLM call failed")
            return None

        try:
            parsed = self._parse_response(response)
        except Exception:
            self.logger.exception("Failed to parse LLM taxonomy response")
            return None

        affinity = parsed.get("weather_affinity", "").strip().lower()
        if affinity not in VALID_WEATHER_AFFINITIES:
            affinity = "neutral"

        category_l1 = parsed.get("category_l1", "").strip().lower() or "general"
        category_l2 = parsed.get("category_l2", "").strip().lower() or category_l1

        seasonality = parsed.get("seasonality", "").strip().lower()
        seasonality = seasonality or AFFINITY_SEASONALITY.get(affinity, "evergreen")

        confidence_raw = parsed.get("confidence", 0.0)
        try:
            confidence = float(confidence_raw)
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        reasoning = parsed.get("reasoning", "").strip()

        model_name = getattr(response, "model", None) or parsed.get("model") or self.model

        return ProductTaxonomyLLMResult(
            category_l1=category_l1,
            category_l2=category_l2,
            weather_affinity=affinity,
            seasonality=seasonality,
            confidence=confidence,
            reasoning=reasoning,
            model=model_name,
            raw_payload=parsed,
        )

    def _classification_prompt(
        self,
        records: Sequence[ProductSourceRecord],
        *,
        combined_text: str | None,
    ) -> str:
        lines: List[str] = [EXAMPLE_PROMPT, "### Task", "Catalog records:"]
        for index, record in enumerate(records, 1):
            lines.append(self._render_record(index, record))
        if combined_text:
            lines.append(f"Combined text: {combined_text[:4000]}")
        lines.append(
            "Return JSON: {\"category_l1\":...,\"category_l2\":...,"
            "\"weather_affinity\":...,\"seasonality\":...,"
            "\"confidence\":0.0-1.0,\"reasoning\":\"short justification\"}"
        )
        return "\n".join(lines)

    def _render_record(self, index: int, record: ProductSourceRecord) -> str:
        parts: List[str] = [f"{index}. source={record.source}"]
        if record.product_name:
            parts.append(f"name={record.product_name}")
        if record.title:
            parts.append(f"title={record.title}")
        if record.category:
            parts.append(f"category={record.category}")
        if record.subcategory:
            parts.append(f"subcategory={record.subcategory}")
        if record.vendor:
            parts.append(f"vendor={record.vendor}")
        if record.brand:
            parts.append(f"brand={record.brand}")
        if record.tags:
            parts.append(f"tags={list(record.tags)}")
        if record.description:
            snippet = record.description.strip()
            if len(snippet) > 160:
                snippet = f"{snippet[:157]}..."
            parts.append(f"description={snippet}")
        return "; ".join(parts)

    def _parse_response(self, response: Any) -> Dict[str, Any]:
        text = self._extract_text(response)
        match = JSON_BLOCK_PATTERN.search(text)
        if match:
            text = match.group(0)
        text = text.strip()
        return json.loads(text)

    def _extract_text(self, response: Any) -> str:
        if isinstance(response, str):
            return response

        content = getattr(response, "content", None)
        if isinstance(content, list):
            texts: List[str] = []
            for block in content:
                if isinstance(block, str):
                    texts.append(block)
                    continue
                text_value = getattr(block, "text", None)
                if text_value is None and isinstance(block, dict):
                    text_value = block.get("text")
                if text_value:
                    texts.append(text_value)
            if texts:
                return "".join(texts)
        elif isinstance(content, str):
            return content

        text_value = getattr(response, "text", None)
        if text_value:
            return text_value

        raise ValueError("LLM response did not contain textual content")

    def _build_default_client(self) -> Any | None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key or anthropic is None:
            return None
        try:
            return anthropic.Anthropic(api_key=api_key)
        except Exception:  # pragma: no cover - SDK import issues
            self.logger.exception("Failed to initialise Anthropic client")
            return None
