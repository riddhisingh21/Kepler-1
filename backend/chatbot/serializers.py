from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import ChatMessage, Feedback

User = get_user_model()


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "session_id",
            "user_text",
            "bot_response",
            "intent",
            "confidence",
            "sentiment",
            "created_at",
        ]
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "date_joined"]
        read_only_fields = ["id", "date_joined"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )


class ChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000)
    session_id = serializers.CharField(max_length=64, required=False, default="default")


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = ["id", "message", "rating", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_rating(self, value: int) -> int:
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class IntentSummarySerializer(serializers.Serializer):
    tag = serializers.CharField()
    num_patterns = serializers.IntegerField()
    num_responses = serializers.IntegerField()


class IntentDetailSerializer(serializers.Serializer):
    tag = serializers.CharField()
    patterns = serializers.ListField(child=serializers.CharField())
    responses = serializers.ListField(child=serializers.CharField())


class IntentWriteSerializer(serializers.Serializer):
    tag = serializers.RegexField(regex=r"^[a-z0-9_\-]+$", max_length=64)
    patterns = serializers.ListField(
        child=serializers.CharField(max_length=500), min_length=1
    )
    responses = serializers.ListField(
        child=serializers.CharField(max_length=1000), min_length=1
    )
