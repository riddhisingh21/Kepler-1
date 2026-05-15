from django.contrib import admin

from .models import ChatMessage, Feedback


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "session_id", "intent", "confidence", "created_at")
    list_filter = ("intent",)
    search_fields = ("user_text", "bot_response", "session_id")


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "rating", "created_at")
    list_filter = ("rating",)
