from __future__ import annotations

from typing import Protocol, TypeVar

from ...domain.ports import CapabilityExecutionContext
from ...domain.jobs import JobAcceptedResponse


TRequest = TypeVar("TRequest")
TResponse = TypeVar("TResponse")


class QueryHandler(Protocol[TRequest, TResponse]):
    def execute(self, ctx: CapabilityExecutionContext, request: TRequest) -> TResponse:
        ...


class CommandHandler(Protocol[TRequest, TResponse]):
    def execute(self, ctx: CapabilityExecutionContext, request: TRequest) -> TResponse:
        ...


class JobHandler(Protocol[TRequest]):
    def start(self, ctx: CapabilityExecutionContext, request: TRequest) -> JobAcceptedResponse:
        ...
