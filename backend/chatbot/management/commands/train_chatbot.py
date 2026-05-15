"""Management command to (re)train the intent classifier."""
from django.core.management.base import BaseCommand

from chatbot.nlp.classifier import get_classifier


class Command(BaseCommand):
    help = "Train the Kepler 1 intent classifier from intents.json"

    def handle(self, *args, **options):
        classifier = get_classifier()
        stats = classifier.train()
        self.stdout.write(self.style.SUCCESS(
            f"Trained on {stats['num_samples']} samples across "
            f"{stats['num_intents']} intents."
        ))
        for tag in stats["intents"]:
            self.stdout.write(f"  - {tag}")
