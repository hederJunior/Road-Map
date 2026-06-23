"""Cliente da REST API do Azure DevOps e montagem do roadmap.

A integração nunca expõe o PAT ao navegador: este código roda no servidor
(FastAPI local ou Lambda), autentica via Basic auth e devolve JSON limpo.

Fluxo:
  1. WIQL  -> retorna apenas IDs dos Epics/Features que casam o filtro
  2. batch -> busca os campos desejados desses IDs (até 200 por chamada)
  3. transform -> monta a árvore Epic->Feature e calcula os trimestres
"""
from __future__ import annotations

import base64
from datetime import date, datetime, timezone
from typing import Any

import httpx

from config import Settings
from models import Epic, Feature, Month, RoadmapResponse, WorkItem

# Estados considerados "concluído" para o cálculo de progresso do epic.
DONE_STATES = {"Closed", "Done", "Completed", "Resolved", "Concluído", "Fechado"}

FIELDS = [
    "System.Id",
    "System.Title",
    "System.WorkItemType",
    "System.State",
    "System.Parent",
    "System.AreaPath",
    "System.IterationPath",
    "System.Tags",
    "System.AssignedTo",
    "Microsoft.VSTS.Scheduling.StartDate",
    "Microsoft.VSTS.Scheduling.TargetDate",
    "Microsoft.VSTS.Common.Priority",
    # Campos customizados do roadmap
    "Custom.24ed5080-e3b3-43a7-af51-2e7ec564b453",   # Data início no Gráfico Gantt
    "Custom.27fa629f-5d4c-42b8-ab24-d8aa430e98a8",   # Data fim no Gráfico Gantt
    "Custom.44b378c0-6c3f-4478-8693-c16e44f9928b",   # Item de roadmap estratégico
]


class AzureDevOpsClient:
    def __init__(self, settings: Settings):
        self.s = settings
        token = base64.b64encode(f":{settings.azure_pat}".encode()).decode()
        self._headers = {
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
        }

    # ---- chamadas HTTP -------------------------------------------------

    async def _query_ids(self, client: httpx.AsyncClient, project: str, team: str | None, state: str | None) -> list[int]:
        clauses = [
            f"[System.TeamProject] = '{project}'",
            f"[System.WorkItemType] IN ('{self.s.epic_type}', '{self.s.feature_type}')",
            "[System.State] <> 'Removed'",
        ]
        if team:
            clauses.append(f"[System.AreaPath] UNDER '{team}'")
        if state:
            clauses.append(f"[System.State] = '{state}'")
        wiql = "SELECT [System.Id] FROM workitems WHERE " + " AND ".join(clauses)

        url = f"{self.s.project_base_url(project)}/wit/wiql?api-version={self.s.azure_api_version}"
        resp = await client.post(url, headers=self._headers, json={"query": wiql})
        resp.raise_for_status()
        return [wi["id"] for wi in resp.json().get("workItems", [])]

    async def _batch(self, client: httpx.AsyncClient, project: str, ids: list[int]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        url = f"{self.s.project_base_url(project)}/wit/workitemsbatch?api-version={self.s.azure_api_version}"
        for chunk in (ids[i : i + 200] for i in range(0, len(ids), 200)):
            resp = await client.post(
                url, headers=self._headers, json={"ids": chunk, "fields": FIELDS}
            )
            resp.raise_for_status()
            out.extend(resp.json().get("value", []))
        return out

    async def get_roadmap(self, project: str | None = None, team: str | None = None, state: str | None = None) -> RoadmapResponse:
        proj = project or self.s.azure_project
        async with httpx.AsyncClient(timeout=30.0) as client:
            ids = await self._query_ids(client, proj, team, state)
            raw = await self._batch(client, proj, ids) if ids else []
        return build_roadmap(raw)


# ---- transformação (puro, testável sem rede) --------------------------

def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def _month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _months_between(start: date, end: date) -> list[str]:
    """Lista de chaves de mês cobertas por [start, end] inclusive."""
    keys: list[str] = []
    y, m = start.year, start.month
    ey, em = end.year, end.month
    while (y, m) <= (ey, em):
        keys.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return keys


def _to_workitem(raw: dict[str, Any]) -> dict[str, Any]:
    f = raw.get("fields", {})
    assigned = f.get("System.AssignedTo")
    tags = f.get("System.Tags")
    # Usa datas do Gantt quando preenchidas; cai no StartDate/TargetDate padrão como fallback
    start = (
        _parse_date(f.get("Custom.24ed5080-e3b3-43a7-af51-2e7ec564b453"))
        or _parse_date(f.get("Microsoft.VSTS.Scheduling.StartDate"))
    )
    target = (
        _parse_date(f.get("Custom.27fa629f-5d4c-42b8-ab24-d8aa430e98a8"))
        or _parse_date(f.get("Microsoft.VSTS.Scheduling.TargetDate"))
    )
    is_roadmap_item = str(f.get("Custom.44b378c0-6c3f-4478-8693-c16e44f9928b") or "").strip().lower() == "sim"

    months: list[str] = []
    if start and target and start <= target:
        months = _months_between(start, target)
    elif target:
        months = [_month_key(target)]
    elif start:
        months = [_month_key(start)]

    return {
        "id": raw["id"],
        "title": f.get("System.Title", ""),
        "type": f.get("System.WorkItemType", ""),
        "state": f.get("System.State", ""),
        "parent_id": f.get("System.Parent"),
        "area_path": f.get("System.AreaPath"),
        "iteration_path": f.get("System.IterationPath"),
        "tags": [t.strip() for t in tags.split(";")] if tags else [],
        "assigned_to": assigned.get("displayName") if isinstance(assigned, dict) else None,
        "start_date": start,
        "target_date": target,
        "priority": f.get("Microsoft.VSTS.Common.Priority"),
        "url": raw.get("url"),
        "months": months,
        "is_roadmap_item": is_roadmap_item,
    }


def build_roadmap(raw_items: list[dict[str, Any]]) -> RoadmapResponse:
    parsed = [_to_workitem(r) for r in raw_items]
    epic_type = {"Epic", "Épico"}

    epics: dict[int, Epic] = {}
    features: list[Feature] = []
    for item in parsed:
        if item["type"] in epic_type:
            # Inclui apenas EPICs marcados como item de roadmap estratégico
            if item.get("is_roadmap_item"):
                epics[item["id"]] = Epic(**{k: v for k, v in item.items() if k != "parent_id"})
        else:
            features.append(Feature(**item))

    orphans: list[Feature] = []
    for feat in features:
        parent = epics.get(feat.parent_id) if feat.parent_id else None
        if parent:
            parent.features.append(feat)
        else:
            orphans.append(feat)

    # progresso + datas herdadas do conjunto de features quando o epic não tem datas
    for epic in epics.values():
        if epic.features:
            done = sum(1 for f in epic.features if f.state in DONE_STATES)
            epic.progress = round(done / len(epic.features), 2)
            if not epic.months:
                ms = sorted({m for f in epic.features for m in f.months})
                epic.months = ms

    # eixo de meses: do menor ao maior presente nos dados
    all_keys = sorted(
        {m for e in epics.values() for m in e.months}
        | {m for e in epics.values() for f in e.features for m in f.months}
        | {m for f in orphans for m in f.months}
    )
    months = _expand_month_axis(all_keys)

    return RoadmapResponse(
        epics=sorted(epics.values(), key=lambda e: (e.months[0] if e.months else "9999", e.title)),
        months=months,
        orphan_features=orphans,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


_MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                 "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _expand_month_axis(keys: list[str]) -> list[Month]:
    """Preenche os meses faltantes entre o primeiro e o último (eixo contínuo)."""
    if not keys:
        return []
    def parse(k: str) -> tuple[int, int]:
        y, m = k.split("-")
        return int(y), int(m)
    (sy, sm), (ey, em) = parse(keys[0]), parse(keys[-1])
    out: list[Month] = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(Month(key=f"{y}-{m:02d}", year=y, month=m, label=f"{_MONTH_LABELS[m-1]} {y}"))
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out
