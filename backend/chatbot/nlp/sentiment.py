"""Tiny lexicon-based sentiment scorer.

Returns a polarity score in [-1.0, 1.0]. Intentionally pure-Python and
dependency-free so the backend stays light; not a replacement for VADER
or a transformer model, but accurate enough for the analytics dashboard.
"""
from __future__ import annotations

import re

_POSITIVE = {
    "good", "great", "awesome", "amazing", "excellent", "love", "loved", "loves",
    "like", "liked", "likes", "nice", "happy", "glad", "thanks", "thank",
    "thankful", "perfect", "fantastic", "wonderful", "cool", "fun", "best",
    "better", "helpful", "useful", "yay", "yes", "ok", "okay", "fine", "super",
    "sweet", "brilliant", "delightful", "pleased", "pleasant", "joy", "win",
}
_NEGATIVE = {
    "bad", "terrible", "awful", "horrible", "hate", "hated", "hates", "dislike",
    "sad", "angry", "annoyed", "annoying", "useless", "stupid", "dumb", "worst",
    "worse", "ugly", "broken", "fail", "failed", "failing", "nope", "no",
    "never", "boring", "slow", "buggy", "crash", "crashed", "wrong", "issue",
    "problem", "error", "sucks", "suck", "sucked", "poor", "lame", "trash",
}
_NEGATORS = {"not", "no", "never", "n't", "cant", "cannot", "can't", "won't", "dont", "don't"}
_INTENSIFIERS = {"very", "really", "super", "extremely", "so", "totally"}

_TOKEN_RE = re.compile(r"[a-zA-Z']+")


def score_sentiment(text: str) -> float:
    """Return a polarity in [-1, 1] for ``text``.

    Uses a small bag-of-words lexicon with naive negation + intensifier
    handling. Zero is neutral.
    """
    if not text:
        return 0.0
    tokens = [t.lower() for t in _TOKEN_RE.findall(text)]
    if not tokens:
        return 0.0

    score = 0.0
    n_hits = 0
    for i, tok in enumerate(tokens):
        polarity = 0.0
        if tok in _POSITIVE:
            polarity = 1.0
        elif tok in _NEGATIVE:
            polarity = -1.0
        if polarity == 0.0:
            continue
        window = tokens[max(0, i - 2):i]
        if any(w in _NEGATORS for w in window):
            polarity = -polarity
        if any(w in _INTENSIFIERS for w in window):
            polarity *= 1.5
        score += polarity
        n_hits += 1

    if n_hits == 0:
        return 0.0
    # Normalize by sqrt of hits so very long messages don't dominate.
    normalized = score / max(1.0, n_hits ** 0.5)
    if normalized > 1.0:
        return 1.0
    if normalized < -1.0:
        return -1.0
    return round(float(normalized), 4)
