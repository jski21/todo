"""Shared models. The on-the-wire shapes (PrintPayload, ResolveScanResponse)
must match supabase/functions/_shared/types.ts and src/types/print.ts."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class PrintLine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str
    qty: Optional[str] = None
    checkbox: bool = False


class PrintPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    format: Literal["list", "ticket", "daily", "custom"]
    title: str
    subtitle: Optional[str] = None
    lines: List[PrintLine] = Field(default_factory=list)
    qr: Optional[str] = None
    barcode: Optional[str] = None
    footer: Optional[str] = None
    cut: bool = True


class PrintJob(BaseModel):
    """Subset of the print_jobs row we care about."""

    model_config = ConfigDict(extra="ignore")
    id: str
    type: str
    payload: PrintPayload
    status: str
    attempts: int = 0


class ResolveScanRequest(BaseModel):
    code: str
    list_id: Optional[str] = None


ResolveScanAction = Literal[
    "completed_task",
    "added_item",
    "incremented_item",
    "needs_name",
    "unknown",
]


class ResolveScanResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    action: ResolveScanAction
    message: str = ""
    item: Optional[dict] = None
    task: Optional[dict] = None
    barcode: Optional[str] = None
