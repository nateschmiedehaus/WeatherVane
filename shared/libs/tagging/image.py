from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class ImageTagger:
    """Placeholder image tagger.

    Future versions will load CLIP/SigLIP checkpoints via ONNX Runtime. This
    stub focuses on keeping the API stable for the catalog tagging UI.
    """

    model_name: str = "clip-ViT-B32"

    def suggest_weather_tags(self, image_path: Path) -> List[str]:
        # Placeholder heuristic: use filename hints until ML pipeline lands.
        name = image_path.stem.lower()
        tags: list[str] = []
        if any(keyword in name for keyword in ("rain", "umbrella", "jacket")):
            tags.append("Rain")
        if any(keyword in name for keyword in ("snow", "ski", "boot")):
            tags.append("Snow")
        if any(keyword in name for keyword in ("sun", "summer", "sunscreen")):
            tags.append("UV")
        if any(keyword in name for keyword in ("heat", "cooling")):
            tags.append("Heat")
        return tags
