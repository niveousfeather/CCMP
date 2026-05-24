from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AcademicPptTaskRequest(BaseModel):
    taskId: str
    taskDir: str
    inputFilePath: str
    settings: dict[str, Any] = Field(default_factory=dict)
    slideCount: int | None = None
    templateId: str | None = None
    language: str | None = None
    deepResearchEnabled: bool = False
    externalResearchEnabled: bool = False
    webSearchEnabled: bool = False
    visualQaEnabled: bool = False
    iconDecorationEnabled: bool = False
    searchProvider: str = "nexus-searxng"
    generatorPreference: str = "paper-ppt-agent"
    resume: bool = False
    resumeFromStep: str | None = None
    modelBridgeUrl: str | None = None


class AcademicPptTaskAccepted(BaseModel):
    taskId: str
    status: Literal["accepted", "running", "failed"]
    message: str | None = None


class AcademicPptTaskStatus(BaseModel):
    taskId: str
    status: str
    progress: int
    currentStep: str
    message: str | None = None
    outputFileName: str | None = None
    outputFileSize: int | None = None
    slideCount: int | None = None
    generationMode: str | None = None
    visualPipelineStatus: str | None = None
    fallbackReason: str | None = None
    modelBridgeStatus: str | None = None
    modelBridgePrimaryModel: str | None = None
    modelBridgePrimaryStatus: str | None = None
    modelBridgeFallbackModel: str | None = None
    modelBridgeFallbackStatus: str | None = None
    modelBridgeErrorSummary: str | None = None
    searchStatus: str | None = None
    researchStatus: str | None = None
    researchSourcesCount: int | None = None
    researchFallbackReason: str | None = None
    previewAvailable: bool | None = None
    previewType: str | None = None
    previewSlideCount: int | None = None
    previewManifestPath: str | None = None
    previewFallbackReason: str | None = None
    previewUpdatedAt: str | None = None
    selectedVariants: list[dict[str, Any]] | None = None
    roleMapping: list[dict[str, Any]] | None = None
    error: str | None = None
    heartbeatAt: str | None = None
    updatedAt: str | None = None


class AcademicPptLogsResponse(BaseModel):
    taskId: str
    logs: list[dict]
