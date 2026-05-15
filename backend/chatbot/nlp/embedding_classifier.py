"""Optional intent classifier built on sentence-transformer embeddings.

Selected when ``CHATBOT_CLASSIFIER_BACKEND=embeddings`` is set. Requires the
extra dependencies in ``requirements-embeddings.txt`` (``sentence-transformers``
and ``torch``); those are intentionally kept out of the default install to
avoid bloating the base Docker image and CI runs.
"""
from __future__ import annotations

import json
import random
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from rapidfuzz import fuzz, process
from sklearn.linear_model import LogisticRegression

from .preprocess import normalize

CONFIDENCE_THRESHOLD = 0.35
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass
class Prediction:
    intent: str
    confidence: float
    response: str


class EmbeddingIntentClassifier:
    """Encodes patterns with a sentence-transformer and fits LogisticRegression."""

    def __init__(self, intents_path: Path, model_path: Path, model_name: str = DEFAULT_MODEL_NAME):
        self.intents_path = Path(intents_path)
        self.model_path = Path(model_path)
        self.model_name = model_name
        self._encoder = None
        self._clf: Optional[LogisticRegression] = None
        self._classes: list[str] = []
        self._responses: dict[str, list[str]] = {}
        self._lock = threading.Lock()

    def load_intents(self) -> dict:
        with open(self.intents_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_intents(self, data: dict) -> None:
        self.intents_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.intents_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def _get_encoder(self):
        if self._encoder is not None:
            return self._encoder
        from sentence_transformers import SentenceTransformer
        self._encoder = SentenceTransformer(self.model_name)
        return self._encoder

    def _encode(self, texts: list[str]) -> np.ndarray:
        return np.asarray(
            self._get_encoder().encode(texts, normalize_embeddings=True, show_progress_bar=False)
        )

    def train(self) -> dict:
        data = self.load_intents()
        texts: list[str] = []
        labels: list[str] = []
        responses: dict[str, list[str]] = {}
        for intent in data["intents"]:
            tag = intent["tag"]
            responses[tag] = intent.get("responses", [])
            for pattern in intent.get("patterns", []):
                texts.append(normalize(pattern) or pattern.lower().strip())
                labels.append(tag)
        embeddings = self._encode(texts)
        clf = LogisticRegression(max_iter=1000, C=4.0)
        clf.fit(embeddings, labels)
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "clf": clf,
                "classes": list(clf.classes_),
                "responses": responses,
                "model_name": self.model_name,
            },
            self.model_path,
        )
        with self._lock:
            self._clf = clf
            self._classes = list(clf.classes_)
            self._responses = responses
        return {
            "num_samples": len(texts),
            "num_intents": len(responses),
            "backend": "embeddings",
            "model_name": self.model_name,
            "intents": sorted(responses.keys()),
        }

    def _ensure_loaded(self) -> None:
        if self._clf is not None:
            return
        with self._lock:
            if self._clf is not None:
                return
            if not self.model_path.exists():
                self.train()
                return
            blob = joblib.load(self.model_path)
            self._clf = blob["clf"]
            self._classes = blob["classes"]
            self._responses = blob["responses"]
            self.model_name = blob.get("model_name", self.model_name)

    def predict(self, text: str, context: list[str] | None = None) -> Prediction:
        self._ensure_loaded()
        assert self._clf is not None
        normalized = normalize(text) or text.lower().strip()
        candidates = [normalized]
        if context and len(normalized.split()) <= 3:
            ctx = " ".join(normalize(c) for c in context if c)
            if ctx:
                candidates.insert(0, f"{ctx} {normalized}".strip())
        embeddings = self._encode(candidates)
        probs_all = self._clf.predict_proba(embeddings)
        best_conf = -1.0
        best_intent = ""
        for probs in probs_all:
            idx = int(probs.argmax())
            conf = float(probs[idx])
            if conf > best_conf:
                best_conf = conf
                best_intent = self._classes[idx]
        confidence = best_conf
        intent = best_intent
        if confidence < CONFIDENCE_THRESHOLD:
            response = (
                "I'm not sure I understood that. Could you rephrase? "
                "You can ask for help to see what I can do."
            )
            return Prediction(intent="fallback", confidence=confidence, response=response)
        choices = self._responses.get(intent) or ["(no response configured)"]
        return Prediction(intent=intent, confidence=confidence, response=random.choice(choices))

    def suggest(self, text: str, k: int = 3) -> list[dict]:
        data = self.load_intents()
        pairs: list[tuple[str, str]] = []
        for intent in data["intents"]:
            for pattern in intent.get("patterns", []):
                pairs.append((intent["tag"], pattern))
        if not pairs:
            return []
        patterns = [p for _, p in pairs]
        matches = process.extract(text, patterns, scorer=fuzz.WRatio, limit=max(k * 4, 8))
        seen: dict[str, dict] = {}
        for pattern, score, idx in matches:
            tag = pairs[idx][0]
            if tag in seen:
                continue
            seen[tag] = {"tag": tag, "pattern": pattern, "score": round(float(score) / 100.0, 4)}
            if len(seen) >= k:
                break
        return list(seen.values())

    def evaluate(self, n_splits: int = 5) -> dict:
        data = self.load_intents()
        num_samples = sum(len(i.get("patterns", [])) for i in data["intents"])
        return {
            "per_intent": [],
            "overall": {},
            "num_samples": num_samples,
            "num_intents": len(data["intents"]),
            "warning": "Cross-validation is not supported on the embedding backend.",
        }
