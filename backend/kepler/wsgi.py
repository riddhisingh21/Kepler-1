"""WSGI config for the Kepler 1 project."""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kepler.settings")
application = get_wsgi_application()
