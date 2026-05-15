from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("chat/", views.ChatView.as_view(), name="chat"),
    path("predict/", views.PredictView.as_view(), name="predict"),
    path("history/", views.HistoryListView.as_view(), name="history-list"),
    path("history/clear/", views.HistoryClearView.as_view(), name="history-clear"),
    path("intents/", views.IntentListView.as_view(), name="intent-list"),
    path("intents/<str:tag>/", views.IntentDetailView.as_view(), name="intent-detail"),
    path("train/", views.TrainView.as_view(), name="train"),
    path("evaluate/", views.EvaluateView.as_view(), name="evaluate"),
    path("feedback/", views.FeedbackView.as_view(), name="feedback"),
    path("stats/", views.StatsView.as_view(), name="stats"),
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("sessions/", views.SessionsListView.as_view(), name="sessions-list"),
    path("messages/<int:pk>/", views.MessageDeleteView.as_view(), name="message-detail"),
]
