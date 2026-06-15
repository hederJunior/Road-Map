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
from models import Epic, Feature, Quarter, RoadmapResponse, WorkItem

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

    async def _query_ids(self, client: httpx.AsyncClient, team: str | None, state: str | None) -> list[int]:
        clauses = [
            f"[System.TeamProject] = '{self.s.azure_project}'",
            f"[System.WorkItemType] IN ('{self.s.epic_type}', '{self.s.feature_type}')",
            "[System.State] <> 'Removed'",
        ]
        if team:
            clauses.append(f"[System.AreaPath] UNDER '{team}'")
        if state:
            clauses.append(f"[System.State] = '{state}'")
        wiql = "SELECT [System.Id] FROM workitems WHERE " + " AND ".join(clauses)

        url = f"{self.s.base_url}/wit/wiql?api-version={self.s.azure_api_version}"
        resp = await client.post(url, headers=self._headers, json={"query": wiql})
        resp.raise_for_status()
        return [wi["id"] for wi in resp.json().get("workItems", [])]

    async def _batch(self, client: httpx.AsyncClient, ids: list[int]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        url = f"{self.s.base_url}/wit/workitemsbatch?api-version={self.s.azure_api_version}"
        for chunk in (ids[i : i + 200] for i in range(0, len(ids), 200)):
            resp = await client.post(
                url, headers=self._headers, json={"ids": chunk, "fields": FIELDS}
            )
            resp.raise_for_status()
            out.extend(resp.json().get("value", []))
        return out

    async def get_roadmap(self, team: str | None = None, state: str | None = None) -> RoadmapResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            ids = await self._query_ids(client, team, state)
            raw = await self._batch(client, ids) if ids else []
        return build_roadmap(raw)


# ---- transformação (puro, testável sem rede) --------------------------

def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def _quarter_key(d: date) -> str:
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def _quarters_between(start: date, end: date) -> list[str]:
    """Lista de chaves de trimestre cobertas por [start, end] inclusive."""
    keys: list[str] = []
    y, q = start.year, (start.month - 1) // 3 + 1
    ey, eq = end.year, (end.month - 1) // 3 + 1
    while (y, q) <= (ey, eq):
        keys.append(f"{y}-Q{q}")
        q += 1
        if q > 4:
            q, y = 1, y + 1
    return keys


def _to_workitem(raw: dict[str, Any]) -> dict[str, Any]:
    f = raw.get("fields", {})
    assigned = f.get("System.AssignedTo")
    tags = f.get("System.Tags")
    start = _parse_date(f.get("Microsoft.VSTS.Scheduling.StartDate"))
    target = _parse_date(f.get("Microsoft.VSTS.Scheduling.TargetDate"))

    quarters: list[str] = []
    if start and target and start <= target:
        quarters = _quarters_between(start, target)
    elif target:
        quarters = [_quarter_key(target)]
    elif start:
        quarters = [_quarter_key(start)]

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
        "quarters": quarters,
    }


def build_roadmap(raw_items: list[dict[str, Any]]) -> RoadmapResponse:
    parsed = [_to_workitem(r) for r in raw_items]
    epic_type = {"Epic", "Épico"}

    epics: dict[int, Epic] = {}
    features: list[Feature] = []
    for item in parsed:
        if item["type"] in epic_type:
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
            if not epic.quarters:
                qs = sorted({q for f in epic.features for q in f.quarters})
                epic.quarters = qs

    # eixo de trimestres: do menor ao maior presente nos dados
    all_keys = sorted(
        {q for e in epics.values() for q in e.quarters}
        | {q for e in epics.values() for f in e.features for q in f.quarters}
        | {q for f in orphans for q in f.quarters}
    )
    quarters = _expand_axis(all_keys)

    return RoadmapResponse(
        epics=sorted(epics.values(), key=lambda e: (e.quarters[0] if e.quarters else "9999", e.title)),
        quarters=quarters,
        orphan_features=orphans,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def _expand_axis(keys: list[str]) -> list[Quarter]:
    """Preenche os trimestres faltantes entre o primeiro e o último (eixo contínuo)."""
    if not keys:
        return []
    def parse(k: str) -> tuple[int, int]:
        y, q = k.split("-Q")
        return int(y), int(q)
    (sy, sq), (ey, eq) = parse(keys[0]), parse(keys[-1])
    out: list[Quarter] = []
    y, q = sy, sq
    while (y, q) <= (ey, eq):
        out.append(Quarter(key=f"{y}-Q{q}", year=y, quarter=q, label=f"Q{q} {y}"))
        q += 1
        if q > 4:
            q, y = 1, y + 1
    return out
