"""Modelos de resposta da API do roadmap."""
from __future__ import annotations
from datetime import date
from pydantic import BaseModel


class WorkItem(BaseModel):
    id: int
    title: str
    type: str
    state: str
    area_path: str | None = None
    iteration_path: str | None = None
    tags: list[str] = []
    assigned_to: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    priority: int | None = None
    url: str | None = None
    # Trimestres ocupados pela barra, ex: ["2025-Q1", "2025-Q2"]
    quarters: list[str] = []


class Feature(WorkItem):
    parent_id: int | None = None


class Epic(WorkItem):
    features: list[Feature] = []
    # Progresso agregado: fração de features em estado concluído (0..1)
    progress: float = 0.0


class Quarter(BaseModel):
    key: str        # "2025-Q1"
    year: int
    quarter: int    # 1..4
    label: str      # "Q1 2025"


class RoadmapResponse(BaseModel):
    epics: list[Epic]
    quarters: list[Quarter]          # eixo horizontal já calculado
    orphan_features: list[Feature]   # features sem epic pai carregado
    generated_at: str
