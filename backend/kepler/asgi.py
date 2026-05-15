"""ASGI config for the Kepler 1 project."""
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kepler.settings")
application = get_asgi_application()
