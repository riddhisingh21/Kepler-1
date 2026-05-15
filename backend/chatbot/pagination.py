from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Standard page-number pagination that allows clients to request larger pages
    via ``?page_size=`` (capped at ``max_page_size``)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500
