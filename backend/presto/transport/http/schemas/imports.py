from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ImportAnalyzeRequestSchema(BaseModel):
    sourceFolders: list[str] = Field(default_factory=list)


class ImportFinalizeProposalSchema(BaseModel):
    filePath: str
    categoryId: str
    originalStem: str
    aiName: str | None = None
    finalName: str | None = None
    status: str
    errorMessage: str | None = None


class ImportFinalizeRequestSchema(BaseModel):
    proposals: list[ImportFinalizeProposalSchema] = Field(default_factory=list)
    manualNameByPath: dict[str, str] = Field(default_factory=dict)


class ImportRunStartRequestSchema(BaseModel):
    folderPaths: list[str] = Field(default_factory=list)
    orderedFilePaths: list[str] = Field(default_factory=list)


class ImportProposalSchema(BaseModel):
    filePath: str
    categoryId: str
    originalStem: str
    aiName: str | None = None
    finalName: str | None = None
    status: str
    errorMessage: str | None = None


class ImportFinalizeResponseSchema(BaseModel):
    proposals: list[ImportProposalSchema]
    resolvedItems: list[dict[str, Any]]
