from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ImportAnalyzeRequestSchema(BaseModel):
    sourceFolders: list[str] = Field(default_factory=list)
    categories: list[dict[str, str]] = Field(default_factory=list)
    analyzeCacheEnabled: bool = True


class ImportAnalyzeRowSchema(BaseModel):
    filePath: str
    categoryId: str
    aiName: str
    finalName: str
    status: str
    errorMessage: str | None = None


class ImportAnalyzeResponseSchema(BaseModel):
    folderPaths: list[str]
    orderedFilePaths: list[str]
    rows: list[ImportAnalyzeRowSchema]
    cache: dict[str, int]


class ImportCacheSaveRequestSchema(BaseModel):
    sourceFolders: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)


class ImportCacheSaveResponseSchema(BaseModel):
    saved: bool
    cacheFiles: int


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
