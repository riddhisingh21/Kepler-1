from django.conf import settings
from django.db import models


class ChatMessage(models.Model):
    """A single user/bot turn stored for history and analytics."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_messages",
        null=True,
        blank=True,
    )
    session_id = models.CharField(max_length=64, db_index=True)
    user_text = models.TextField()
    bot_response = models.TextField()
    intent = models.CharField(max_length=64, blank=True, default="")
    confidence = models.FloatField(default=0.0)
    sentiment = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["session_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.session_id}] {self.user_text[:40]}"


class Feedback(models.Model):
    """User feedback for a specific bot reply."""

    message = models.ForeignKey(
        ChatMessage, on_delete=models.CASCADE, related_name="feedback"
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Feedback({self.rating}) for msg {self.message_id}"
