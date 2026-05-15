"""REST API views for the Kepler 1 chatbot."""
from __future__ import annotations

import time
from datetime import timedelta

from django.db.models import Avg, Count, Max
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from .models import ChatMessage, Feedback
from .nlp.classifier import CONFIDENCE_THRESHOLD, get_classifier
from .nlp.sentiment import score_sentiment
from .serializers import (
    ChatMessageSerializer,
    ChatRequestSerializer,
    FeedbackSerializer,
    IntentDetailSerializer,
    IntentSummarySerializer,
    IntentWriteSerializer,
    RegisterSerializer,
    UserSerializer,
)

CONTEXT_TURNS = 2


class HealthView(APIView):
    """GET /api/health/ - basic liveness probe."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "kepler-1"})


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ - create a new user account."""

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class MeView(APIView):
    """GET /api/auth/me/ - return the currently authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChatView(APIView):
    """POST /api/chat/ - classify a user message and return a bot reply."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, UserRateThrottle]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        text = serializer.validated_data["message"]
        session_id = serializer.validated_data["session_id"]
        user = request.user if request.user.is_authenticated else None
        context_qs = ChatMessage.objects.filter(
            session_id=session_id, user=user
        ).order_by("-created_at").values_list("user_text", flat=True)[:CONTEXT_TURNS]
        context = list(reversed(list(context_qs)))
        classifier = get_classifier()
        start = time.perf_counter()
        prediction = classifier.predict(text, context=context)
        latency_ms = int((time.perf_counter() - start) * 1000)
        sentiment = score_sentiment(text)
        suggestions: list[dict] = []
        if prediction.confidence < CONFIDENCE_THRESHOLD:
            try:
                suggestions = classifier.suggest(text, k=3)
            except Exception:
                suggestions = []
        message = ChatMessage.objects.create(
            user=user,
            session_id=session_id,
            user_text=text,
            bot_response=prediction.response,
            intent=prediction.intent,
            confidence=prediction.confidence,
            sentiment=sentiment,
        )
        return Response(
            {
                "id": message.id,
                "session_id": session_id,
                "intent": prediction.intent,
                "confidence": prediction.confidence,
                "response": prediction.response,
                "sentiment": sentiment,
                "suggestions": suggestions,
                "latency_ms": latency_ms,
                "created_at": message.created_at,
            },
            status=status.HTTP_201_CREATED,
        )


class PredictView(APIView):
    """POST /api/predict/ - classify without storing history."""

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prediction = get_classifier().predict(serializer.validated_data["message"])
        return Response({
            "intent": prediction.intent,
            "confidence": prediction.confidence,
            "response": prediction.response,
        })


class HistoryListView(generics.ListAPIView):
    """GET /api/history/ - paginated chat history, scoped to the current user."""

    serializer_class = ChatMessageSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            qs = ChatMessage.objects.filter(user=self.request.user)
        else:
            qs = ChatMessage.objects.filter(user__isnull=True)
        session = self.request.query_params.get("session_id")
        if session:
            qs = qs.filter(session_id=session)
        return qs


class HistoryClearView(APIView):
    """DELETE /api/history/clear/ - delete history for the current user/session."""

    permission_classes = [AllowAny]

    def delete(self, request):
        if request.user.is_authenticated:
            qs = ChatMessage.objects.filter(user=request.user)
        else:
            qs = ChatMessage.objects.filter(user__isnull=True)
        session = request.query_params.get("session_id")
        if session:
            qs = qs.filter(session_id=session)
        deleted, _ = qs.delete()
        return Response({"deleted": deleted})


class IntentListView(APIView):
    """GET/POST /api/intents/ - list or create intents."""

    def get(self, request):
        data = get_classifier().load_intents()
        summaries = [
            {
                "tag": i["tag"],
                "num_patterns": len(i.get("patterns", [])),
                "num_responses": len(i.get("responses", [])),
            }
            for i in data["intents"]
        ]
        return Response(IntentSummarySerializer(summaries, many=True).data)

    def post(self, request):
        serializer = IntentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        classifier = get_classifier()
        data = classifier.load_intents()
        if any(i["tag"] == payload["tag"] for i in data["intents"]):
            return Response(
                {"detail": "Intent already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        data["intents"].append(payload)
        classifier.save_intents(data)
        return Response(IntentDetailSerializer(payload).data, status=status.HTTP_201_CREATED)


class IntentDetailView(APIView):
    """GET/PUT/DELETE /api/intents/<tag>/ - manage a single intent."""

    def get(self, request, tag: str):
        data = get_classifier().load_intents()
        for intent in data["intents"]:
            if intent["tag"] == tag:
                return Response(IntentDetailSerializer(intent).data)
        return Response({"detail": "Intent not found."}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, tag: str):
        serializer = IntentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        if payload["tag"] != tag:
            return Response(
                {"detail": "Tag in URL must match payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        classifier = get_classifier()
        data = classifier.load_intents()
        for idx, intent in enumerate(data["intents"]):
            if intent["tag"] == tag:
                data["intents"][idx] = payload
                classifier.save_intents(data)
                return Response(IntentDetailSerializer(payload).data)
        return Response({"detail": "Intent not found."}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, tag: str):
        classifier = get_classifier()
        data = classifier.load_intents()
        remaining = [i for i in data["intents"] if i["tag"] != tag]
        if len(remaining) == len(data["intents"]):
            return Response({"detail": "Intent not found."}, status=status.HTTP_404_NOT_FOUND)
        data["intents"] = remaining
        classifier.save_intents(data)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrainView(APIView):
    """POST /api/train/ - retrain the classifier from intents.json."""

    throttle_classes = [AnonRateThrottle, UserRateThrottle]

    def post(self, request):
        stats = get_classifier().train()
        return Response({"status": "trained", **stats})


class EvaluateView(APIView):
    """GET /api/evaluate/ - 5-fold cross-validation report for the classifier."""

    permission_classes = [AllowAny]

    def get(self, request):
        report = get_classifier().evaluate()
        return Response(report)


class MessageDeleteView(APIView):
    """DELETE /api/messages/<id>/ - remove a single message (edit + regenerate)."""

    permission_classes = [AllowAny]

    def delete(self, request, pk: int):
        if request.user.is_authenticated:
            qs = ChatMessage.objects.filter(user=request.user)
        else:
            qs = ChatMessage.objects.filter(user__isnull=True)
        message = get_object_or_404(qs, pk=pk)
        message.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionsListView(APIView):
    """GET /api/sessions/ - distinct chat sessions with last message + counts."""

    permission_classes = [AllowAny]

    def get(self, request):
        if request.user.is_authenticated:
            qs = ChatMessage.objects.filter(user=request.user)
        else:
            qs = ChatMessage.objects.filter(user__isnull=True)
        rows = (
            qs.values("session_id")
            .annotate(count=Count("id"), last_at=Max("created_at"))
            .order_by("-last_at")
        )
        sessions = []
        for row in rows:
            last = (
                qs.filter(session_id=row["session_id"])
                .order_by("-created_at")
                .values("user_text", "intent")
                .first()
            )
            sessions.append({
                "session_id": row["session_id"],
                "count": row["count"],
                "last_at": row["last_at"],
                "last_user_text": (last or {}).get("user_text", ""),
                "last_intent": (last or {}).get("intent", ""),
            })
        return Response({"sessions": sessions})


class FeedbackView(generics.CreateAPIView):
    """POST /api/feedback/ - submit feedback for a chat message."""

    queryset = Feedback.objects.all()
    serializer_class = FeedbackSerializer


class StatsView(APIView):
    """GET /api/stats/ - aggregate counts across the system."""

    def get(self, request):
        data = get_classifier().load_intents()
        return Response({
            "num_intents": len(data["intents"]),
            "num_messages": ChatMessage.objects.count(),
            "num_feedback": Feedback.objects.count(),
            "intents": [i["tag"] for i in data["intents"]],
        })


CONFIDENCE_BUCKETS = (
    ("0.00-0.25", 0.0, 0.25),
    ("0.25-0.50", 0.25, 0.50),
    ("0.50-0.75", 0.50, 0.75),
    ("0.75-1.00", 0.75, 1.0001),
)


class AnalyticsView(APIView):
    """GET /api/analytics/ - aggregated chatbot usage metrics.

    Scoped to the authenticated user when a JWT is provided; otherwise
    aggregates over anonymous traffic only.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if request.user.is_authenticated:
            qs = ChatMessage.objects.filter(user=request.user)
        else:
            qs = ChatMessage.objects.filter(user__isnull=True)

        total = qs.count()
        avg_conf = qs.aggregate(avg=Avg("confidence"))["avg"] or 0.0

        intent_rows = (
            qs.values("intent")
            .annotate(count=Count("id"), avg_confidence=Avg("confidence"))
            .order_by("-count")
        )
        intents = [
            {
                "intent": row["intent"] or "(unlabeled)",
                "count": row["count"],
                "avg_confidence": round(float(row["avg_confidence"] or 0.0), 4),
            }
            for row in intent_rows
        ]

        buckets = []
        for label, low, high in CONFIDENCE_BUCKETS:
            buckets.append({
                "bucket": label,
                "count": qs.filter(confidence__gte=low, confidence__lt=high).count(),
            })

        since = timezone.now().date() - timedelta(days=13)
        daily_rows = (
            qs.filter(created_at__date__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"), avg_sentiment=Avg("sentiment"))
            .order_by("day")
        )
        by_day = {
            row["day"].isoformat(): (
                row["count"], round(float(row["avg_sentiment"] or 0.0), 4)
            )
            for row in daily_rows
        }
        daily = []
        sentiment_daily = []
        for offset in range(14):
            day = (since + timedelta(days=offset)).isoformat()
            count, avg_sent = by_day.get(day, (0, 0.0))
            daily.append({"day": day, "count": count})
            sentiment_daily.append({"day": day, "avg_sentiment": avg_sent})

        heatmap = [[0] * 24 for _ in range(7)]
        hour_rows = (
            qs.annotate(hour=ExtractHour("created_at"), dow=ExtractIsoWeekDay("created_at"))
            .values("hour", "dow")
            .annotate(count=Count("id"))
        )
        for row in hour_rows:
            dow = (row["dow"] or 1) - 1
            hour = row["hour"] or 0
            if 0 <= dow < 7 and 0 <= hour < 24:
                heatmap[dow][hour] = row["count"]

        low_conf_qs = (
            qs.filter(confidence__lt=CONFIDENCE_THRESHOLD)
            .order_by("-created_at")[:10]
        )
        low_confidence = [
            {
                "id": m.id,
                "user_text": m.user_text,
                "intent": m.intent,
                "confidence": round(float(m.confidence), 4),
                "created_at": m.created_at,
            }
            for m in low_conf_qs
        ]

        avg_sent = qs.aggregate(avg=Avg("sentiment"))["avg"] or 0.0
        return Response({
            "total_messages": total,
            "avg_confidence": round(float(avg_conf), 4),
            "avg_sentiment": round(float(avg_sent), 4),
            "num_feedback": Feedback.objects.filter(
                message__user=request.user if request.user.is_authenticated else None
            ).count(),
            "intents": intents,
            "confidence_buckets": buckets,
            "daily": daily,
            "sentiment_daily": sentiment_daily,
            "heatmap": heatmap,
            "low_confidence": low_confidence,
            "threshold": CONFIDENCE_THRESHOLD,
        })
