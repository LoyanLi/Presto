from __future__ import annotations

from collections import OrderedDict
from collections.abc import Iterable

from ...domain.capabilities import CapabilityDefinition, CapabilityRegistryProtocol
from ...domain.errors import CapabilityNotFoundError, CapabilityRegistryConflictError
from .catalog import DEFAULT_CAPABILITY_DEFINITIONS


class InMemoryCapabilityRegistry(CapabilityRegistryProtocol):
    def __init__(self, definitions: Iterable[CapabilityDefinition] = ()) -> None:
        self._definitions: "OrderedDict[str, CapabilityDefinition]" = OrderedDict()
        for definition in definitions:
            self.register(definition)

    def register(self, definition: CapabilityDefinition) -> None:
        if definition.id in self._definitions:
            raise CapabilityRegistryConflictError(definition.id)
        self._definitions[definition.id] = definition

    def list_public(self) -> list[CapabilityDefinition]:
        return [definition for definition in self._definitions.values() if definition.visibility == "public"]

    def list_all(self) -> list[CapabilityDefinition]:
        return list(self._definitions.values())

    def get(self, capability_id: str) -> CapabilityDefinition | None:
        return self._definitions.get(capability_id)

    def require(self, capability_id: str) -> CapabilityDefinition:
        definition = self.get(capability_id)
        if definition is None:
            raise CapabilityNotFoundError(capability_id)
        return definition

    def has(self, capability_id: str) -> bool:
        return capability_id in self._definitions


def build_default_capability_registry() -> InMemoryCapabilityRegistry:
    return InMemoryCapabilityRegistry(DEFAULT_CAPABILITY_DEFINITIONS)

