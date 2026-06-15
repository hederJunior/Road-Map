# Painel de Roadmap — KMM × Azure DevOps

Painel de roadmap (timeline Gantt por trimestre, hierarquia **Epic → Feature**)
alimentado pelos work items do seu projeto no Azure DevOps.

## Arquitetura

```
  Navegador                  Servidor (você controla)            Azure DevOps
┌─────────────┐   GET        ┌──────────────────────┐   REST 7.1  ┌──────────────┐
│  Painel     │ ───────────▶ │  FastAPI             │ ──────────▶ │  WIQL +      │
│  React      │  /api/roadmap│  - guarda o PAT      │  Basic auth │  workitems   │
│ (sem PAT)   │ ◀─────────── │  - WIQL + batch      │ ◀────────── │  batch       │
└─────────────┘   JSON limpo └──────────────────────┘             └──────────────┘
```

**Por que o backend é obrigatório:** o navegador não pode chamar `dev.azure.com`
direto (CORS bloqueia) e o PAT nunca pode ir para o frontend (qualquer um leria).
O FastAPI fica no meio: guarda o token, consulta o Azure e devolve JSON tratado.

## Conteúdo

| Arquivo | O que é |
|---|---|
| `PainelRoadmap.jsx` | Painel React (timeline). Roda com dados de exemplo até você apontar para o backend. |
| `backend/config.py` | Configuração via variáveis de ambiente. |
| `backend/azure_client.py` | Cliente Azure DevOps + montagem da árvore Epic→Feature e cálculo dos trimestres. |
| `backend/models.py` | Modelos Pydantic da resposta. |
| `backend/main.py` | App FastAPI (`/api/roadmap`, `/health`). |
| `backend/lambda_handler.py` | Adaptador para AWS Lambda (Mangum). |
| `backend/.env.example` | Modelo das variáveis de ambiente. |

## 1. Gerar o PAT

No Azure DevOps → *User settings* → *Personal access tokens* → *New Token*.
Escopo mínimo: **Work Items → Read**. Copie o token.

## 2. Subir o backend (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # preencha AZURE_ORG, AZURE_PROJECT, AZURE_PAT
uvicorn main:app --reload
```

Teste: `http://localhost:8000/health` e `http://localhost:8000/docs`.

## 3. Conectar o painel

No topo do `PainelRoadmap.jsx`, troque:

```js
const API_BASE = "";                      // dados de exemplo
const API_BASE = "http://localhost:8000"; // backend real
```

O painel passa a chamar `GET /api/roadmap` ao carregar e no botão **Sincronizar**.

## 4. (Opcional) Deploy em Lambda

`handler = lambda_handler.handler`. Configure as env vars no Lambda e guarde o PAT
no **AWS Secrets Manager / SSM Parameter Store** — nunca no código nem no .env versionado.
Empacote com `pip install -r requirements.txt -t package/` + zip, ou container image / AWS SAM.

## Como o roadmap é montado

1. **WIQL** filtra Epics e Features do projeto (com filtros opcionais de Area Path e estado) e retorna só os IDs.
2. **workitemsbatch** busca os campos (título, estado, `System.Parent`, datas de início/alvo, responsável, tags).
3. A árvore Epic→Feature sai do campo `System.Parent`; os trimestres saem de `StartDate`/`TargetDate`; o progresso do epic é a fração de features concluídas.

### Ajustes comuns

- **Tipos custom** (ex.: "Iniciativa" no lugar de Epic): mude `EPIC_TYPE`/`FEATURE_TYPE` no `.env`.
- **Sem datas nos work items?** A barra só aparece com `StartDate`/`TargetDate` preenchidos. Se você planeja por sprint, dá para derivar o trimestre do `IterationPath` — me avise que adapto o `azure_client.py`.
- **Filtrar por squad:** use `?team=KMM\\Squad TMS` (Area Path) na chamada.
