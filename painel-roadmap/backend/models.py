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
    description: str | None = None
    # Meses ocupados pela barra, ex: ["2025-07", "2025-08"]
    months: list[str] = []
    is_roadmap_item: bool = False


class Feature(WorkItem):
    parent_id: int | None = None


class Epic(WorkItem):
    features: list[Feature] = []
    # Progresso agregado: fração de features em estado concluído (0..1)
    progress: float = 0.0


class Month(BaseModel):
    key: str        # "2025-07"
    year: int
    month: int      # 1..12
    label: str      # "Jul 2025"


class RoadmapResponse(BaseModel):
    epics: list[Epic]
    months: list[Month]              # eixo horizontal já calculado
    orphan_features: list[Feature]   # features sem epic pai carregado
    generated_at: str
