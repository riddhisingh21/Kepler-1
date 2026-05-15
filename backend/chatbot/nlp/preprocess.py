"""Text preprocessing utilities backed by NLTK."""
from __future__ import annotations

import re
import threading

import nltk
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize

_NLTK_LOCK = threading.Lock()
_NLTK_READY = False

_lemmatizer = WordNetLemmatizer()
_token_re = re.compile(r"[a-zA-Z']+")


_NLTK_RESOURCES = (
    ("punkt", "tokenizers/punkt"),
    ("punkt_tab", "tokenizers/punkt_tab/english/"),
    ("wordnet", "corpora/wordnet"),
    ("omw-1.4", "corpora/omw-1.4"),
)


def ensure_nltk_data() -> None:
    """Download required NLTK corpora if they are not already on disk."""
    global _NLTK_READY
    if _NLTK_READY:
        return
    with _NLTK_LOCK:
        if _NLTK_READY:
            return
        for pkg, resource in _NLTK_RESOURCES:
            try:
                nltk.data.find(resource)
            except (LookupError, OSError):
                try:
                    nltk.download(pkg, quiet=True, raise_on_error=False)
                except Exception:
                    pass
        _NLTK_READY = True


def tokenize(text: str) -> list[str]:
    """Lowercase, tokenize and lemmatize an input string."""
    ensure_nltk_data()
    text = text.lower().strip()
    try:
        tokens = word_tokenize(text)
    except Exception:
        tokens = _token_re.findall(text)
    return [_lemmatizer.lemmatize(t) for t in tokens if _token_re.match(t)]


def normalize(text: str) -> str:
    """Return a whitespace-joined string of preprocessed tokens."""
    return " ".join(tokenize(text))
