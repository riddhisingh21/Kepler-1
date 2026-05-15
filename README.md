# Kepler 1 — A Chatbot

An NLP-based chatbot capable of **intent recognition** and **response generation**, served by a **Django REST** backend and an **interactive React** frontend.

## Highlights

- 15 REST APIs covering chat, intents, training, history, feedback, stats, **analytics** and JWT auth.
- NLP pipeline: NLTK tokenization + lemmatization → TF-IDF (uni/bi-grams) → Logistic Regression intent classifier.
- **Pluggable classifier backends** — default TF-IDF or optional `sentence-transformers` (MiniLM) selectable via env var.
- Intents and responses are data-driven via `backend/chatbot/nlp/intents.json` (no code changes needed to extend).
- Confidence-aware replies with a fallback intent for low-confidence inputs.
- **JWT authentication** with per-user chat history isolation.
- **OpenAPI / Swagger UI** auto-generated docs at `/api/docs/`.
- React (Vite) chat UI with **sign-in / sign-up**, tabbed navigation and an **analytics dashboard** (recharts).
- Jupyter notebook for training, cross-validation and offline evaluation.
- Unit tests covering every endpoint (chat, auth, scoping, analytics, schema).

## Tech stack

| Layer    | Tech                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| Backend  | Python 3.11, Django 4, Django REST Framework, SimpleJWT, drf-spectacular      |
| Database | SQLite                                                                        |
| NLP      | NLTK, scikit-learn, joblib (optional: sentence-transformers)                  |
| Frontend | React 18, Vite, recharts, plain CSS                                           |
| Tooling  | Jupyter Notebook, django-cors-headers                                         |

## Project structure

```
.
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── kepler/                 # Django project (settings, urls, wsgi/asgi)
│   └── chatbot/                # Django app
│       ├── models.py           # ChatMessage, Feedback
│       ├── serializers.py
│       ├── views.py            # 10 API views
│       ├── urls.py
│       ├── tests.py
│       ├── management/commands/train_chatbot.py
│       └── nlp/
│           ├── intents.json    # training data + responses
│           ├── preprocess.py   # NLTK pipeline
│           └── classifier.py   # TF-IDF + LogisticRegression
├── frontend/                   # React + Vite chat UI
└── notebooks/
    └── intent_classifier_training.ipynb
```

## REST API

Base URL: `http://127.0.0.1:8000/api/`

Interactive docs: **`/api/docs/`** (Swagger UI) and **`/api/redoc/`** (ReDoc). Raw OpenAPI schema: `/api/schema/`.

| Method | Path                  | Auth | Purpose                                      |
| ------ | --------------------- | ---- | -------------------------------------------- |
| GET    | `/health/`            | —    | Liveness probe                               |
| POST   | `/auth/register/`     | —    | Create a new user                            |
| POST   | `/auth/login/`        | —    | Obtain JWT access + refresh tokens           |
| POST   | `/auth/refresh/`      | —    | Refresh an access token                      |
| GET    | `/auth/me/`           | JWT  | Current user info                            |
| POST   | `/chat/`              | opt. | Send a message, get a bot reply              |
| POST   | `/predict/`           | —    | Classify without storing history             |
| GET    | `/history/`           | opt. | List chat messages (per user when logged in) |
| DELETE | `/history/clear/`     | opt. | Clear history (per user when logged in)      |
| GET    | `/intents/`           | —    | List all intents with counts                 |
| GET    | `/intents/<tag>/`     | —    | Retrieve a single intent                     |
| POST   | `/train/`             | —    | (Re)train the classifier                     |
| POST   | `/feedback/`          | —    | Submit feedback for a bot reply              |
| GET    | `/stats/`             | —    | Aggregate stats                              |
| GET    | `/analytics/`         | opt. | Intent distribution, confidence buckets, daily counts (per user when logged in) |

### Example

```bash
curl -X POST http://127.0.0.1:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{"message": "hello there", "session_id": "demo"}'
```

```json
{
  "id": 1,
  "session_id": "demo",
  "intent": "greeting",
  "confidence": 0.87,
  "response": "Hello! I'm Kepler 1, how can I help you today?",
  "created_at": "2025-01-01T12:00:00Z"
}
```

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate           # Windows
# source .venv/bin/activate        # macOS / Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py train_chatbot     # trains and persists model.joblib
python manage.py runserver
```

The API is now live at `http://127.0.0.1:8000/api/`. Open `http://127.0.0.1:8000/api/docs/` for Swagger UI.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to Django.

### Tests

```bash
cd backend
python manage.py test
```

## Authentication

Register, log in and use the returned `access` token as a `Bearer` header:

```bash
curl -X POST http://127.0.0.1:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
# -> {"access":"<jwt>","refresh":"<jwt>"}

curl http://127.0.0.1:8000/api/auth/me/ -H "Authorization: Bearer <jwt>"
```

When a request to `/api/chat/` or `/api/history/` includes a valid bearer token, messages are associated with that user and history is scoped to them.

## Adding a new intent

Edit `backend/chatbot/nlp/intents.json` and add:

```json
{
  "tag": "order_status",
  "patterns": ["where is my order", "track order", "order status"],
  "responses": ["You can track your order on the Orders page."]
}
```

Then retrain:

```bash
python manage.py train_chatbot
# or hit POST /api/train/
```

## Classifier backends

Two intent-classifier backends are shipped; the choice is controlled by the
`CHATBOT_CLASSIFIER_BACKEND` environment variable (default: `tfidf`):

| Backend      | Deps                                                    | When to use                                  |
| ------------ | ------------------------------------------------------- | -------------------------------------------- |
| `tfidf`      | `scikit-learn`, `nltk` (already in `requirements.txt`)  | Default. Fast and lightweight.               |
| `embeddings` | `sentence-transformers` (`requirements-embeddings.txt`) | Higher accuracy on paraphrased queries.      |

To switch on the embedding backend locally:

```bash
pip install -r requirements-embeddings.txt
$env:CHATBOT_CLASSIFIER_BACKEND = "embeddings"   # PowerShell
# export CHATBOT_CLASSIFIER_BACKEND=embeddings   # bash
python manage.py train_chatbot
python manage.py runserver
```

Both backends expose the same `train()` / `predict()` interface and store a
`model.joblib` at `backend/chatbot/nlp/model.joblib`, so the rest of the stack
is unchanged.

## Analytics dashboard

The React app exposes a second tab — **Analytics** — that fetches
`GET /api/analytics/` and renders:

- total messages, average confidence, distinct intents seen, feedback count;
- top intents (bar chart);
- confidence buckets (0.00–0.25, 0.25–0.50, 0.50–0.75, 0.75–1.00);
- messages per day for the last 14 days (line chart).

When signed in, the dashboard is **scoped to your own messages**; anonymous
visitors see anonymous traffic only.

## Notebook

Open `notebooks/intent_classifier_training.ipynb` in Jupyter to explore the dataset, run cross-validation and re-train the model interactively.
