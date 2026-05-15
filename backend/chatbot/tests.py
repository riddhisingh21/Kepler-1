"""End-to-end tests for the Kepler 1 chatbot REST API."""
import json
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from chatbot.models import ChatMessage
from chatbot.nlp.classifier import reset_classifier

User = get_user_model()


class ChatbotAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health(self):
        resp = self.client.get(reverse("health"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

    def test_chat_creates_message(self):
        resp = self.client.post(
            reverse("chat"), {"message": "hello there"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertIn("intent", body)
        self.assertIn("response", body)
        self.assertIn("latency_ms", body)
        self.assertIsInstance(body["latency_ms"], int)
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_intents_list(self):
        resp = self.client.get(reverse("intent-list"))
        self.assertEqual(resp.status_code, 200)
        tags = {item["tag"] for item in resp.json()}
        self.assertIn("greeting", tags)

    def test_intent_detail_not_found(self):
        resp = self.client.get(reverse("intent-detail", args=["nope"]))
        self.assertEqual(resp.status_code, 404)

    def test_train_endpoint(self):
        resp = self.client.post(reverse("train"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "trained")

    def test_history_and_clear(self):
        self.client.post(reverse("chat"), {"message": "hi"}, format="json")
        self.client.post(reverse("chat"), {"message": "bye"}, format="json")
        resp = self.client.get(reverse("history-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 2)
        resp = self.client.delete(reverse("history-clear"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(ChatMessage.objects.count(), 0)

    def test_feedback(self):
        chat = self.client.post(
            reverse("chat"), {"message": "hello"}, format="json"
        ).json()
        resp = self.client.post(
            reverse("feedback"),
            {"message": chat["id"], "rating": 5, "comment": "great"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_stats(self):
        resp = self.client.get(reverse("stats"))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("num_intents", resp.json())


class AuthAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_and_login(self):
        resp = self.client.post(
            reverse("register"),
            {"username": "alice", "email": "a@a.com", "password": "secret123"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(username="alice").exists())

        resp = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)

    def test_me_requires_auth(self):
        resp = self.client.get(reverse("me"))
        self.assertEqual(resp.status_code, 401)

    def test_history_scoped_to_user(self):
        alice = User.objects.create_user(username="alice", password="pw12345")
        bob = User.objects.create_user(username="bob", password="pw12345")

        client_a = APIClient()
        client_a.force_authenticate(user=alice)
        client_a.post(reverse("chat"), {"message": "hello"}, format="json")

        client_b = APIClient()
        client_b.force_authenticate(user=bob)
        client_b.post(reverse("chat"), {"message": "bye"}, format="json")

        resp = client_a.get(reverse("history-list"))
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["user_text"], "hello")


class AnalyticsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_analytics_empty(self):
        resp = self.client.get(reverse("analytics"))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["total_messages"], 0)
        self.assertEqual(body["intents"], [])
        self.assertEqual(len(body["confidence_buckets"]), 4)
        self.assertEqual(len(body["daily"]), 14)
        self.assertEqual(len(body["heatmap"]), 7)
        self.assertTrue(all(len(row) == 24 for row in body["heatmap"]))
        self.assertEqual(sum(sum(row) for row in body["heatmap"]), 0)
        self.assertEqual(body["low_confidence"], [])
        self.assertIn("threshold", body)

    def test_analytics_aggregates_messages(self):
        self.client.post(reverse("chat"), {"message": "hello"}, format="json")
        self.client.post(reverse("chat"), {"message": "thanks"}, format="json")
        resp = self.client.get(reverse("analytics"))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["total_messages"], 2)
        self.assertGreater(len(body["intents"]), 0)
        self.assertEqual(sum(b["count"] for b in body["confidence_buckets"]), 2)
        self.assertEqual(sum(d["count"] for d in body["daily"]), 2)
        self.assertEqual(sum(sum(r) for r in body["heatmap"]), 2)

    def test_analytics_scoped_to_user(self):
        alice = User.objects.create_user(username="alice", password="pw12345")
        bob = User.objects.create_user(username="bob", password="pw12345")

        client_a = APIClient()
        client_a.force_authenticate(user=alice)
        client_a.post(reverse("chat"), {"message": "hi"}, format="json")
        client_a.post(reverse("chat"), {"message": "bye"}, format="json")

        client_b = APIClient()
        client_b.force_authenticate(user=bob)
        client_b.post(reverse("chat"), {"message": "hello"}, format="json")

        resp = client_a.get(reverse("analytics"))
        self.assertEqual(resp.json()["total_messages"], 2)
        resp = client_b.get(reverse("analytics"))
        self.assertEqual(resp.json()["total_messages"], 1)


class IntentCRUDTests(TestCase):
    """Edits operate on a temporary intents.json so the real one is untouched."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmpdir = tempfile.mkdtemp(prefix="kepler-intents-")
        cls._tmp_intents = Path(cls._tmpdir) / "intents.json"
        cls._tmp_model = Path(cls._tmpdir) / "model.joblib"
        shutil.copy(settings.CHATBOT_INTENTS_PATH, cls._tmp_intents)
        cls._override = override_settings(
            CHATBOT_INTENTS_PATH=cls._tmp_intents,
            CHATBOT_MODEL_PATH=cls._tmp_model,
        )
        cls._override.enable()
        reset_classifier()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        reset_classifier()
        shutil.rmtree(cls._tmpdir, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()

    def _read(self):
        return json.loads(self._tmp_intents.read_text(encoding="utf-8"))

    def test_create_update_delete_intent(self):
        payload = {
            "tag": "feature_test",
            "patterns": ["this is a unique test pattern"],
            "responses": ["test reply"],
        }
        resp = self.client.post(reverse("intent-list"), payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("feature_test", [i["tag"] for i in self._read()["intents"]])

        # Duplicate should conflict
        resp = self.client.post(reverse("intent-list"), payload, format="json")
        self.assertEqual(resp.status_code, 409)

        # Update
        payload["responses"] = ["updated reply"]
        resp = self.client.put(
            reverse("intent-detail", args=["feature_test"]), payload, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        updated = next(i for i in self._read()["intents"] if i["tag"] == "feature_test")
        self.assertEqual(updated["responses"], ["updated reply"])

        # Delete
        resp = self.client.delete(reverse("intent-detail", args=["feature_test"]))
        self.assertEqual(resp.status_code, 204)
        self.assertNotIn("feature_test", [i["tag"] for i in self._read()["intents"]])

    def test_invalid_tag_rejected(self):
        resp = self.client.post(
            reverse("intent-list"),
            {"tag": "Bad Tag!", "patterns": ["hi"], "responses": ["ok"]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


class SessionsAndMessagesTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_sessions_list(self):
        self.client.post(
            reverse("chat"),
            {"message": "hello", "session_id": "alpha"},
            format="json",
        )
        self.client.post(
            reverse("chat"),
            {"message": "bye", "session_id": "beta"},
            format="json",
        )
        resp = self.client.get(reverse("sessions-list"))
        self.assertEqual(resp.status_code, 200)
        sessions = resp.json()["sessions"]
        self.assertEqual(len(sessions), 2)
        ids = {s["session_id"] for s in sessions}
        self.assertEqual(ids, {"alpha", "beta"})
        self.assertTrue(all("last_user_text" in s for s in sessions))

    def test_delete_message(self):
        body = self.client.post(
            reverse("chat"), {"message": "hello"}, format="json"
        ).json()
        msg_id = body["id"]
        resp = self.client.delete(reverse("message-detail", args=[msg_id]))
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(ChatMessage.objects.filter(pk=msg_id).exists())

    def test_delete_message_scoped_to_user(self):
        alice = User.objects.create_user(username="alice", password="pw12345")
        bob = User.objects.create_user(username="bob", password="pw12345")
        client_a = APIClient()
        client_a.force_authenticate(user=alice)
        body = client_a.post(
            reverse("chat"), {"message": "hello"}, format="json"
        ).json()
        client_b = APIClient()
        client_b.force_authenticate(user=bob)
        resp = client_b.delete(reverse("message-detail", args=[body["id"]]))
        self.assertEqual(resp.status_code, 404)


class SentimentAndSuggestionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_chat_includes_sentiment(self):
        resp = self.client.post(
            reverse("chat"),
            {"message": "this is awesome, I love it"},
            format="json",
        )
        body = resp.json()
        self.assertIn("sentiment", body)
        self.assertGreater(body["sentiment"], 0)
        msg = ChatMessage.objects.get(pk=body["id"])
        self.assertGreater(msg.sentiment, 0)

    def test_chat_negative_sentiment(self):
        resp = self.client.post(
            reverse("chat"),
            {"message": "this is terrible, I hate it"},
            format="json",
        )
        self.assertLess(resp.json()["sentiment"], 0)

    def test_chat_returns_suggestions_on_low_confidence(self):
        resp = self.client.post(
            reverse("chat"),
            {"message": "asdjkasdhjkahsdkjahsdkjhasdkjh"},
            format="json",
        )
        body = resp.json()
        self.assertIn("suggestions", body)
        self.assertIsInstance(body["suggestions"], list)


class EvaluateTests(TestCase):
    def test_evaluate_endpoint(self):
        resp = APIClient().get(reverse("evaluate"))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("per_intent", body)
        self.assertIn("overall", body)
        self.assertIn("num_samples", body)


class AnalyticsSentimentTests(TestCase):
    def test_analytics_includes_sentiment_daily(self):
        client = APIClient()
        client.post(reverse("chat"), {"message": "great"}, format="json")
        resp = client.get(reverse("analytics"))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("sentiment_daily", body)
        self.assertEqual(len(body["sentiment_daily"]), 14)
        self.assertIn("avg_sentiment", body)


class SchemaTests(TestCase):
    def test_schema_endpoint(self):
        resp = APIClient().get("/api/schema/")
        self.assertEqual(resp.status_code, 200)
