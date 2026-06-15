"""API do painel de roadmap (KMM / Azure DevOps).

Em produção (container do App Runner) este mesmo serviço entrega o frontend
React já buildado E a API, na mesma origem — o que elimina qualquer problema
de CORS. Em desenvolvimento, roda só a API e o Vite faz proxy de /api.

Rodar local:
    uvicorn main:app --reload
Docs interativas:
    http://localhost:8000/docs
"""
from __future__ import annotations

from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from azure_client import AzureDevOpsClient
from config import get_settings
from models import RoadmapResponse

settings = get_settings()
app = FastAPI(title="Roadmap KMM API", version="1.0.0")

# CORS só é necessário em dev (front e back em portas diferentes).
# Em produção front+back saem da mesma origem e o CORS nem é acionado.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "org": settings.azure_org, "project": settings.azure_project}


@app.get("/api/roadmap", response_model=RoadmapResponse)
async def roadmap(
    team: str | None = Query(None, description="Filtra por Area Path (ex: 'KMM\\\\Squad TMS')"),
    state: str | None = Query(None, description="Filtra por estado (ex: 'Active')"),
) -> RoadmapResponse:
    client = AzureDevOpsClient(settings)
    try:
        return await client.get_roadmap(team=team, state=state)
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code in (401, 403):
            raise HTTPException(401, "PAT inválido ou sem permissão de leitura de Work Items.")
        if code == 404:
            raise HTTPException(404, "Organização ou projeto não encontrado. Verifique AZURE_ORG/AZURE_PROJECT.")
        raise HTTPException(502, f"Erro do Azure DevOps ({code}).")
    except httpx.RequestError as e:
        raise HTTPException(503, f"Falha de conexão com o Azure DevOps: {e}")


# --- Frontend estático (presente só na imagem de produção) -------------
# O Dockerfile copia o build do React para ./static. Se a pasta existir,
# o FastAPI serve o painel em "/". Este mount fica POR ÚLTIMO para não
# capturar as rotas /api e /health acima.
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
