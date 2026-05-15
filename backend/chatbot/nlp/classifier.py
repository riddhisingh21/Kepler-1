"""Intent classifier built on TF-IDF + Logistic Regression."""
from __future__ import annotations

import json
import random
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import joblib
from rapidfuzz import fuzz, process
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline

from .preprocess import normalize

CONFIDENCE_THRESHOLD = 0.25


@dataclass
class Prediction:
    intent: str
    confidence: float
    response: str


class IntentClassifier:
    """Loads intents, trains a model and predicts intents for user input."""

    def __init__(self, intents_path: Path, model_path: Path):
        self.intents_path = Path(intents_path)
        self.model_path = Path(model_path)
        self._pipeline: Optional[Pipeline] = None
        self._responses: dict[str, list[str]] = {}
        self._lock = threading.Lock()

    def load_intents(self) -> dict:
        with open(self.intents_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_intents(self, data: dict) -> None:
        self.intents_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.intents_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def _build_pipeline(self) -> Pipeline:
        return Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, C=4.0)),
        ])

    def train(self) -> dict:
        data = self.load_intents()
        texts: list[str] = []
        labels: list[str] = []
        responses: dict[str, list[str]] = {}
        for intent in data["intents"]:
            tag = intent["tag"]
            responses[tag] = intent.get("responses", [])
            for pattern in intent.get("patterns", []):
                texts.append(normalize(pattern))
                labels.append(tag)
        pipeline = self._build_pipeline()
        pipeline.fit(texts, labels)
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"pipeline": pipeline, "responses": responses}, self.model_path)
        with self._lock:
            self._pipeline = pipeline
            self._responses = responses
        return {
            "num_samples": len(texts),
            "num_intents": len(responses),
            "intents": sorted(responses.keys()),
        }

    def _ensure_loaded(self) -> None:
        if self._pipeline is not None:
            return
        with self._lock:
            if self._pipeline is not None:
                return
            if not self.model_path.exists():
                self.train()
                return
            blob = joblib.load(self.model_path)
            self._pipeline = blob["pipeline"]
            self._responses = blob["responses"]

    def predict(self, text: str, context: list[str] | None = None) -> Prediction:
        self._ensure_loaded()
        assert self._pipeline is not None
        normalized = normalize(text) or text.lower().strip()
        candidates = [normalized]
        if context and len(normalized.split()) <= 3:
            ctx = " ".join(normalize(c) for c in context if c)
            if ctx:
                candidates.insert(0, f"{ctx} {normalized}".strip())
        best_conf = -1.0
        best_intent = ""
        classes = self._pipeline.classes_
        for cand in candidates:
            probs = self._pipeline.predict_proba([cand])[0]
            idx = int(probs.argmax())
            conf = float(probs[idx])
            if conf > best_conf:
                best_conf = conf
                best_intent = classes[idx]
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
        """Fuzzy match ``text`` against all patterns and return top ``k`` intents.

        Used as a 'did you mean…?' fallback when classifier confidence is low.
        Each entry: ``{"tag", "pattern", "score"}`` with ``score`` in [0, 1].
        """
        data = self.load_intents()
        pairs: list[tuple[str, str]] = []
        for intent in data["intents"]:
            for pattern in intent.get("patterns", []):
                pairs.append((intent["tag"], pattern))
        if not pairs:
            return []
        patterns = [p for _, p in pairs]
        matches = process.extract(
            text, patterns, scorer=fuzz.WRatio, limit=max(k * 4, 8)
        )
        seen: dict[str, dict] = {}
        for pattern, score, idx in matches:
            tag = pairs[idx][0]
            if tag in seen:
                continue
            seen[tag] = {
                "tag": tag,
                "pattern": pattern,
                "score": round(float(score) / 100.0, 4),
            }
            if len(seen) >= k:
                break
        return list(seen.values())

    def evaluate(self, n_splits: int = 5) -> dict:
        """Run stratified k-fold CV on the intents and return per-intent metrics."""
        data = self.load_intents()
        texts: list[str] = []
        labels: list[str] = []
        for intent in data["intents"]:
            for pattern in intent.get("patterns", []):
                texts.append(normalize(pattern))
                labels.append(intent["tag"])
        if not texts:
            return {"per_intent": [], "overall": {}, "num_samples": 0, "num_intents": 0}

        from collections import Counter
        counts = Counter(labels)
        min_class = min(counts.values())
        splits = min(n_splits, min_class)
        if splits < 2:
            return {
                "per_intent": [],
                "overall": {},
                "num_samples": len(texts),
                "num_intents": len(counts),
                "warning": (
                    "Not enough samples per intent for cross-validation "
                    f"(min class has {min_class})."
                ),
            }

        skf = StratifiedKFold(n_splits=splits, shuffle=True, random_state=42)
        y_true: list[str] = []
        y_pred: list[str] = []
        for train_idx, test_idx in skf.split(texts, labels):
            X_tr = [texts[i] for i in train_idx]
            y_tr = [labels[i] for i in train_idx]
            X_te = [texts[i] for i in test_idx]
            y_te = [labels[i] for i in test_idx]
            pipe = self._build_pipeline()
            pipe.fit(X_tr, y_tr)
            preds = pipe.predict(X_te)
            y_true.extend(y_te)
            y_pred.extend(preds.tolist())

        intent_labels = sorted(counts.keys())
        precision, recall, f1, support = precision_recall_fscore_support(
            y_true, y_pred, labels=intent_labels, zero_division=0
        )
        per_intent = [
            {
                "tag": tag,
                "precision": round(float(p), 4),
                "recall": round(float(r), 4),
                "f1": round(float(f), 4),
                "support": int(s),
            }
            for tag, p, r, f, s in zip(intent_labels, precision, recall, f1, support)
        ]
        macro_p, macro_r, macro_f, _ = precision_recall_fscore_support(
            y_true, y_pred, average="macro", zero_division=0
        )
        accuracy = sum(1 for a, b in zip(y_true, y_pred) if a == b) / len(y_true)
        return {
            "per_intent": per_intent,
            "overall": {
                "accuracy": round(float(accuracy), 4),
                "macro_precision": round(float(macro_p), 4),
                "macro_recall": round(float(macro_r), 4),
                "macro_f1": round(float(macro_f), 4),
            },
            "num_samples": len(texts),
            "num_intents": len(counts),
            "n_splits": splits,
        }


_classifier_singleton = None
_singleton_lock = threading.Lock()


def _build_classifier():
    from django.conf import settings
    backend = getattr(settings, "CHATBOT_CLASSIFIER_BACKEND", "tfidf").lower()
    if backend == "embeddings":
        from .embedding_classifier import EmbeddingIntentClassifier
        return EmbeddingIntentClassifier(
            intents_path=settings.CHATBOT_INTENTS_PATH,
            model_path=settings.CHATBOT_MODEL_PATH,
            model_name=getattr(
                settings,
                "CHATBOT_EMBEDDING_MODEL",
                "sentence-transformers/all-MiniLM-L6-v2",
            ),
        )
    return IntentClassifier(
        intents_path=settings.CHATBOT_INTENTS_PATH,
        model_path=settings.CHATBOT_MODEL_PATH,
    )


def get_classifier():
    """Return a process-wide classifier instance based on the configured backend."""
    global _classifier_singleton
    if _classifier_singleton is not None:
        return _classifier_singleton
    with _singleton_lock:
        if _classifier_singleton is None:
            _classifier_singleton = _build_classifier()
        return _classifier_singleton


def reset_classifier() -> None:
    """Discard the cached classifier (used in tests when settings change)."""
    global _classifier_singleton
    with _singleton_lock:
        _classifier_singleton = None
