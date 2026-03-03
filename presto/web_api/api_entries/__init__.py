"""API entry modules keyed by frontend API entry names."""

from presto.web_api.api_entries.registry import API_ENTRIES, register_api_entries

__all__ = ["API_ENTRIES", "register_api_entries"]
