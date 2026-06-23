import React, { useMemo, useState, useEffect } from "react";
import {
  ChevronRight, ChevronDown, RefreshCw, X, ExternalLink, Calendar, Loader2, ArrowLeft, Map as MapIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  INTEGRAÇÃO COM O BACKEND
 *  Vazio = mesma origem. Em produção o FastAPI serve este painel e a API
 *  juntos, então as chamadas vão para /api/roadmap sem CORS. Em dev, o
 *  Vite faz proxy de /api para o backend (ver vite.config.js).
 *  Se a API não responder, o painel cai nos dados de exemplo (modo demo).
 * ------------------------------------------------------------------ */
const API_BASE = "";

const MW = 80;           // largura de cada coluna de mês (px)
const ROW_EPIC = 50;
const ROW_FEAT = 40;
const RAIL = 320;        // largura da coluna esquerda

/* ---- cores por estado do work item ---- */
const STATE = {
  New:      { bar: "#9499A2", soft: "#EEF0F2", label: "A iniciar" },
  Proposed: { bar: "#9499A2", soft: "#EEF0F2", label: "Proposto" },
  Active:   { bar: "#FF3D03", soft: "#FFE7DE", label: "Em andamento" },
  Resolved: { bar: "#E8A33D", soft: "#FBEFD9", label: "Resolvido" },
  Closed:   { bar: "#3D9A5C", soft: "#E1F1E7", label: "Concluído" },
  Done:     { bar: "#3D9A5C", soft: "#E1F1E7", label: "Concluído" },
};
const stateOf = (s) => STATE[s] || { bar: "#9499A2", soft: "#EEF0F2", label: s || "—" };

/* ================================================================== *
 *  DADOS DE EXEMPLO  (mesma forma que o backend devolve)
 * ================================================================== */
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const M = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const mObj = (y, m) => ({ key: M(y, m), year: y, month: m, label: `${MONTH_NAMES[m-1]} ${y}` });
const mRange = (y1, m1, y2, m2) => {
  const keys = []; let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) { keys.push(M(y, m)); m++; if (m > 12) { m = 1; y++; } }
  return keys;
};

const MOCK = {
  generated_at: new Date().toISOString(),
  months: [
    mObj(2025,7), mObj(2025,8), mObj(2025,9), mObj(2025,10), mObj(2025,11), mObj(2025,12),
    mObj(2026,1), mObj(2026,2), mObj(2026,3), mObj(2026,4), mObj(2026,5), mObj(2026,6),
    mObj(2026,7), mObj(2026,8), mObj(2026,9), mObj(2026,10), mObj(2026,11), mObj(2026,12),
  ],
  orphan_features: [],
  epics: [
    {
      id: 4021, title: "Integração Trizy Super App", type: "Epic", state: "Active",
      area_path: "KMM\\Squad Integrações", progress: 0.67, months: mRange(2025,8, 2026,3),
      start_date: "2025-08-01", target_date: "2026-03-20", assigned_to: "Eduarda Kalinoski",
      tags: ["Trizy", "Integração"],
      features: [
        { id: 4101, title: "Login federado Trizy", state: "Closed", months: mRange(2025,7, 2025,9), assigned_to: "Vinicius Spode", tags: ["Auth"], target_date: "2025-09-30" },
        { id: 4102, title: "Sincronização de fretes", state: "Closed", months: mRange(2025,10, 2025,12), assigned_to: "Eduarda Kalinoski", tags: ["Fretes"], target_date: "2025-12-15" },
        { id: 4103, title: "Push de status de viagem", state: "Active", months: mRange(2026,1, 2026,3), assigned_to: "Vinicius Spode", tags: ["Eventos"], target_date: "2026-03-20" },
      ],
    },
    {
      id: 4040, title: "Reforma Tributária — IBS / CBS", type: "Epic", state: "Active",
      area_path: "KMM\\Squad Fiscal", progress: 0.25, months: mRange(2025,11, 2026,9),
      start_date: "2025-11-01", target_date: "2026-09-30", assigned_to: "Eduarda Kalinoski",
      tags: ["Fiscal", "Compliance"],
      features: [
        { id: 4201, title: "Motor de cálculo IBS/CBS", state: "Active", months: mRange(2025,10, 2026,3), assigned_to: "Vinicius Spode", tags: ["Cálculo"], target_date: "2026-03-31" },
        { id: 4202, title: "Adequação de documentos fiscais", state: "New", months: mRange(2026,4, 2026,6), assigned_to: null, tags: ["DF-e"], target_date: "2026-06-30" },
        { id: 4203, title: "Relatórios de transição 2026–2033", state: "New", months: mRange(2026,7, 2026,9), assigned_to: null, tags: ["Relatórios"], target_date: "2026-09-30" },
      ],
    },
    {
      id: 4060, title: "API de Ticket de Pesagem", type: "Epic", state: "Closed",
      area_path: "KMM\\Squad TMS", progress: 1.0, months: mRange(2025,7, 2025,12),
      start_date: "2025-07-15", target_date: "2025-12-20", assigned_to: "Vinicius Spode",
      tags: ["API", "Balança"],
      features: [
        { id: 4301, title: "Endpoint de leitura de balança", state: "Closed", months: mRange(2025,7, 2025,9), assigned_to: "Vinicius Spode", tags: ["API"], target_date: "2025-09-15" },
        { id: 4302, title: "Webhook de pesagem concluída", state: "Closed", months: mRange(2025,10, 2025,12), assigned_to: "Vinicius Spode", tags: ["Webhook"], target_date: "2025-12-20" },
      ],
    },
    {
      id: 4080, title: "KMM5 — Nova plataforma TMS", type: "Epic", state: "Active",
      area_path: "KMM\\Squad Plataforma", progress: 0.0, months: mRange(2026,1, 2026,12),
      start_date: "2026-01-10", target_date: "2026-12-20", assigned_to: "Heder",
      tags: ["KMM5", "Plataforma"],
      features: [
        { id: 4401, title: "Arquitetura multi-tenant", state: "Active", months: mRange(2026,1, 2026,6), assigned_to: "Vinicius Spode", tags: ["Arquitetura"], target_date: "2026-06-30" },
        { id: 4402, title: "Migração de cadastros KMM4→KMM5", state: "New", months: mRange(2026,7, 2026,9), assigned_to: null, tags: ["Migração"], target_date: "2026-09-30" },
        { id: 4403, title: "Painel de indicadores", state: "New", months: mRange(2026,7, 2026,12), assigned_to: null, tags: ["Dashboard"], target_date: "2026-12-15" },
        { id: 4404, title: "Onboarding de transportadoras", state: "New", months: mRange(2026,10, 2026,12), assigned_to: null, tags: ["Onboarding"], target_date: "2026-12-20" },
      ],
    },
    {
      id: 4099, title: "Integração efrete / CIOT", type: "Epic", state: "Resolved",
      area_path: "KMM\\Squad Integrações", progress: 1.0, months: mRange(2025,10, 2026,2),
      start_date: "2025-10-01", target_date: "2026-02-28", assigned_to: "Eduarda Kalinoski",
      tags: ["CIOT", "SOAP"],
      features: [
        { id: 4501, title: "Envelope SOAP CIOT", state: "Resolved", months: mRange(2025,10, 2025,12), assigned_to: "Vinicius Spode", tags: ["SOAP"], target_date: "2025-12-30" },
        { id: 4502, title: "Validação de cadastro de motorista", state: "Resolved", months: mRange(2026,1, 2026,2), assigned_to: "Vinicius Spode", tags: ["Validação"], target_date: "2026-02-28" },
      ],
    },
  ],
};

/* ================================================================== *
 *  HELPERS
 * ================================================================== */
const todayFraction = (months) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const idx = months.findIndex((mx) => mx.year === y && mx.month === m);
  if (idx === -1) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  return idx + (now.getDate() - 1) / daysInMonth;
};

const fmtDate = (s) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/* ================================================================== *
 *  COMPONENTE
 * ================================================================== */
/* ================================================================== *
 *  LANDING PAGE — seleção de projeto
 * ================================================================== */
function LandingPage({ onSelect }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects`)
      .then((r) => r.json())
      .then((list) => { setProjects(list); setLoading(false); })
      .catch(() => { setProjects(["KMM4", "KMM5"]); setLoading(false); });
  }, []);

  return (
    <div className="rm-root" style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600&display=swap');
        .rm-root{--bg:#F6F6F4;--surface:#FFFFFF;--ink:#424449;--soft:#6B6E76;--line:#E6E6E3;--accent:#FF3D03;
          font-family:'Barlow',system-ui,sans-serif;color:var(--ink);background:var(--bg);
          border:1px solid var(--line);border-radius:14px;overflow:hidden;}
        .rm-root *{box-sizing:border-box;}
        .rm-head{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .rm-title{font-weight:700;font-size:19px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;}
        .rm-dot{width:9px;height:20px;background:var(--accent);border-radius:2px;}
        .rm-sub{font-size:12px;color:var(--soft);font-weight:500;}
        .rm-proj-grid{display:flex;gap:20px;padding:40px;flex-wrap:wrap;justify-content:center;flex:1;align-items:center;}
        .rm-proj-card{background:var(--surface);border:1.5px solid var(--line);border-radius:14px;padding:32px 40px;
          cursor:pointer;text-align:center;transition:border-color .15s,box-shadow .15s;min-width:200px;}
        .rm-proj-card:hover{border-color:var(--accent);box-shadow:0 4px 20px rgba(255,61,3,.12);}
        .rm-proj-name{font-weight:700;font-size:26px;letter-spacing:-.02em;margin-bottom:6px;}
        .rm-proj-sub{font-size:12px;color:var(--soft);font-weight:500;}
        .rm-proj-arrow{margin-top:16px;color:var(--accent);display:flex;align-items:center;justify-content:center;gap:6px;font-weight:600;font-size:13px;}
      `}</style>
      <div className="rm-head">
        <div>
          <div className="rm-title"><span className="rm-dot" />Roadmap de Produto</div>
          <div className="rm-sub">Selecione o roadmap que deseja visualizar</div>
        </div>
      </div>
      <div className="rm-proj-grid">
        {loading ? (
          <Loader2 size={28} style={{ color: "var(--soft)", animation: "spin 1s linear infinite" }} />
        ) : (
          projects.map((proj) => (
            <div key={proj} className="rm-proj-card" onClick={() => onSelect(proj)}>
              <div style={{ color: "#FF3D03", marginBottom: 12 }}><MapIcon size={32} /></div>
              <div className="rm-proj-name">{proj}</div>
              <div className="rm-proj-sub">Azure DevOps · Epics → Features</div>
              <div className="rm-proj-arrow">Ver roadmap <ChevronRight size={15} /></div>
            </div>
          ))
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ================================================================== *
 *  PAINEL DE ROADMAP
 * ================================================================== */
function PainelRoadmap({ project, onBack }) {
  const [data, setData] = useState(MOCK);
  const [expanded, setExpanded] = useState(() => new Set(MOCK.epics.map((e) => e.id)));
  const [yearFilter, setYearFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [demo, setDemo] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (project) params.set("project", project);
      if (stateFilter !== "all") params.set("state", stateFilter);
      const res = await fetch(`${API_BASE}/api/roadmap?${params}`);
      if (!res.ok) throw new Error(`Backend respondeu ${res.status}`);
      const json = await res.json();
      setData({ ...json, months: json.months || [] });
      setExpanded(new Set(json.epics.map((e) => e.id)));
      setDemo(false);
    } catch (e) {
      // sem backend: mantém os dados de exemplo e sinaliza modo demonstração
      setData({ ...MOCK, generated_at: new Date().toISOString() });
      setDemo(true);
      setError(e.message || "Falha ao conectar no backend.");
    } finally {
      setLoading(false);
    }
  }

  // carrega da API assim que o painel abre
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [project]);

  /* eixo visível conforme filtro de ano */
  const months = useMemo(
    () => data.months.filter((m) => yearFilter === "all" || String(m.year) === yearFilter),
    [data.months, yearFilter]
  );
  const mIndex = useMemo(() => new Map(months.map((m, i) => [m.key, i])), [months]);

  /* epics + features após filtros */
  const epics = useMemo(() => {
    const inAxis = (ms) => (ms || []).filter((k) => mIndex.has(k));
    return data.epics
      .map((e) => {
        const feats = e.features
          .filter((f) => stateFilter === "all" || f.state === stateFilter)
          .filter((f) => inAxis(f.months).length > 0)
          .map((f) => ({ ...f, _vis: inAxis(f.months) }));
        const epicAxis = inAxis(e.months);
        const keepByState = stateFilter === "all" || e.state === stateFilter || feats.length > 0;
        return { ...e, features: feats, _vis: epicAxis, _keep: keepByState && (epicAxis.length > 0 || feats.length > 0) };
      })
      .filter((e) => e._keep);
  }, [data.epics, mIndex, stateFilter]);

  /* lista plana de linhas (alinha rail + timeline) */
  const rows = useMemo(() => {
    const r = [];
    epics.forEach((e) => {
      r.push({ kind: "epic", item: e });
      if (expanded.has(e.id)) e.features.forEach((f) => r.push({ kind: "feature", item: f, epic: e }));
    });
    return r;
  }, [epics, expanded]);

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todayX = useMemo(() => todayFraction(months), [months]);
  const gridW = months.length * MW;
  const rowsH = rows.reduce((a, r) => a + (r.kind === "epic" ? ROW_EPIC : ROW_FEAT), 0);

  /* barra posicionada por índice de mês */
  const barBox = (visKeys) => {
    if (!visKeys || !visKeys.length) return null;
    const idxs = visKeys.map((k) => mIndex.get(k)).filter((i) => i != null);
    if (!idxs.length) return null;
    const s = Math.min(...idxs), e = Math.max(...idxs);
    return { left: s * MW + 4, width: (e - s + 1) * MW - 8 };
  };

  const years = [...new Set(data.months.map((m) => m.year))];
  const yearGroups = useMemo(() => {
    const g = [];
    months.forEach((m) => {
      const last = g[g.length - 1];
      if (last && last.year === m.year) last.span += 1;
      else g.push({ year: m.year, span: 1 });
    });
    return g;
  }, [months]);

  return (
    <div className="rm-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600&display=swap');
        .rm-root{--bg:#F6F6F4;--surface:#FFFFFF;--ink:#424449;--soft:#6B6E76;--line:#E6E6E3;--accent:#FF3D03;
          font-family:'Barlow',system-ui,sans-serif;color:var(--ink);background:var(--bg);
          border:1px solid var(--line);border-radius:14px;overflow:hidden;min-height:560px;}
        .rm-root *{box-sizing:border-box;}
        .rm-head{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .rm-title{font-weight:700;font-size:19px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;}
        .rm-dot{width:9px;height:20px;background:var(--accent);border-radius:2px;}
        .rm-sub{font-size:12px;color:var(--soft);font-weight:500;}
        .rm-spacer{flex:1;}
        .rm-sel{font-family:'Barlow';font-size:13px;font-weight:500;color:var(--ink);background:var(--bg);
          border:1px solid var(--line);border-radius:8px;padding:7px 10px;cursor:pointer;}
        .rm-sync{display:flex;align-items:center;gap:7px;font-family:'Barlow';font-weight:600;font-size:13px;
          background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;}
        .rm-sync:hover{filter:brightness(.94);}
        .rm-legend{display:flex;gap:14px;padding:9px 20px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .rm-leg{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--soft);font-weight:500;}
        .rm-chip{width:11px;height:11px;border-radius:3px;}
        .rm-body{display:flex;overflow-x:auto;}
        .rm-rail{flex:0 0 ${RAIL}px;width:${RAIL}px;background:var(--surface);border-right:1px solid var(--line);position:sticky;left:0;z-index:3;}
        .rm-railhead{height:42px;display:flex;align-items:flex-end;padding:0 16px 8px;font-family:'Barlow Semi Condensed';
          font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);border-bottom:1px solid var(--line);}
        .rm-rrow{display:flex;align-items:center;border-bottom:1px solid var(--line);padding-right:12px;cursor:pointer;}
        .rm-rrow:hover{background:var(--bg);}
        .rm-epicname{font-weight:600;font-size:13.5px;line-height:1.15;}
        .rm-featname{font-weight:500;font-size:12.5px;color:var(--ink);line-height:1.15;}
        .rm-meta{font-size:10.5px;color:var(--soft);font-family:'Barlow Semi Condensed';font-weight:500;}
        .rm-caret{width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:var(--soft);flex:0 0 18px;}
        .rm-grid{position:relative;}
        .rm-qhead{display:flex;height:42px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2;}
        .rm-ycell{border-right:1px solid var(--line);}
        .rm-ylabel{font-family:'Barlow Semi Condensed';font-weight:600;font-size:11px;letter-spacing:.1em;color:var(--soft);padding:5px 10px 0;}
        .rm-qlabel{font-weight:600;font-size:12px;color:var(--ink);padding:0 10px;display:flex;align-items:center;height:21px;}
        .rm-lanes{position:relative;}
        .rm-colline{position:absolute;top:0;bottom:0;width:1px;background:var(--line);}
        .rm-grow{position:relative;border-bottom:1px solid var(--line);}
        .rm-bar{position:absolute;top:50%;transform:translateY(-50%);border-radius:6px;display:flex;align-items:center;
          padding:0 9px;overflow:hidden;cursor:pointer;box-shadow:0 1px 2px rgba(66,68,73,.12);transition:filter .12s,box-shadow .12s;}
        .rm-bar:hover{filter:brightness(.96);box-shadow:0 2px 8px rgba(66,68,73,.2);}
        .rm-barlabel{font-size:11.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}
        .rm-today{position:absolute;top:0;bottom:0;width:2px;background:var(--accent);z-index:4;pointer-events:none;}
        .rm-todaytag{position:absolute;top:2px;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:9px;
          font-weight:700;font-family:'Barlow Semi Condensed';letter-spacing:.06em;padding:2px 6px;border-radius:4px;white-space:nowrap;}
        .rm-prog{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.28);border-radius:6px 0 0 6px;}
        .rm-drawer{position:absolute;top:0;right:0;bottom:0;width:330px;background:var(--surface);border-left:1px solid var(--line);
          box-shadow:-8px 0 24px rgba(66,68,73,.12);z-index:10;padding:20px;overflow-y:auto;animation:rmslide .18s ease;}
        @keyframes rmslide{from{transform:translateX(20px);opacity:0;}to{transform:translateX(0);opacity:1;}}
        .rm-dx{position:absolute;top:14px;right:14px;border:none;background:var(--bg);border-radius:7px;width:30px;height:30px;cursor:pointer;color:var(--soft);display:flex;align-items:center;justify-content:center;}
        .rm-dtype{font-family:'Barlow Semi Condensed';font-weight:600;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);}
        .rm-dtitle{font-weight:700;font-size:17px;line-height:1.25;margin:6px 0 16px;padding-right:24px;}
        .rm-frow{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:13px;}
        .rm-flabel{color:var(--soft);font-weight:500;}
        .rm-fval{font-weight:600;text-align:right;}
        .rm-tag{display:inline-block;background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-size:11px;font-weight:500;margin:0 4px 4px 0;}
        .rm-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;}
        .rm-link{display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-weight:600;font-size:13px;text-decoration:none;margin-top:14px;}
        .rm-err{margin:0 20px 12px;padding:10px 14px;background:#FFE7DE;border:1px solid #FFB59C;border-radius:8px;font-size:12.5px;color:#B5340A;font-weight:500;}
        .rm-foot{padding:9px 20px;font-size:11px;color:var(--soft);font-family:'Barlow Semi Condensed';font-weight:500;border-top:1px solid var(--line);background:var(--surface);}
      `}</style>

      {/* HEADER */}
      <div className="rm-head">
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--soft)", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Barlow'", fontWeight: 600, fontSize: 13, padding: "4px 0" }}>
            <ArrowLeft size={15} /> Projetos
          </button>
        )}
        <div>
          <div className="rm-title"><span className="rm-dot" />Roadmap · {project || "Produto"}</div>
          <div className="rm-sub">Epics → Features · Azure DevOps {demo ? "· dados de exemplo" : "· conectado"}</div>
        </div>
        <div className="rm-spacer" />
        <select className="rm-sel" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="all">Todos os anos</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <select className="rm-sel" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="all">Todos os estados</option>
          {["New", "Active", "Resolved", "Closed"].map((s) => <option key={s} value={s}>{stateOf(s).label}</option>)}
        </select>
        <button className="rm-sync" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={15} className="rm-spin" style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
          Sincronizar
        </button>
      </div>

      {/* LEGENDA */}
      <div className="rm-legend">
        {["Active", "Resolved", "Closed", "New"].map((s) => (
          <span className="rm-leg" key={s}><span className="rm-chip" style={{ background: stateOf(s).bar }} />{stateOf(s).label}</span>
        ))}
        <span className="rm-leg" style={{ marginLeft: "auto" }}><Calendar size={12} /> barra do epic preenchida = progresso das features</span>
      </div>

      {demo && <div className="rm-err">Sem conexão com o backend — exibindo dados de exemplo. {error}</div>}

      {/* CORPO */}
      <div className="rm-body" style={{ position: "relative" }}>
        {/* RAIL ESQUERDA */}
        <div className="rm-rail">
          <div className="rm-railhead">Epic / Feature</div>
          {rows.map((r) => {
            const isEpic = r.kind === "epic";
            const h = isEpic ? ROW_EPIC : ROW_FEAT;
            return (
              <div key={`${r.kind}-${r.item.id}`} className="rm-rrow" style={{ height: h, paddingLeft: isEpic ? 12 : 38 }}
                onClick={() => isEpic ? toggle(r.item.id) : setSelected({ ...r.item, type: "Feature", epicTitle: r.epic.title })}>
                {isEpic && <span className="rm-caret">{expanded.has(r.item.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>}
                <div style={{ minWidth: 0, flex: 1 }} onClick={(e) => { if (isEpic) { e.stopPropagation(); setSelected(r.item); } }}>
                  <div className={isEpic ? "rm-epicname" : "rm-featname"} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.item.title}
                  </div>
                  {isEpic && <div className="rm-meta">#{r.item.id} · {r.item.features.length} features · {Math.round(r.item.progress * 100)}%</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* TIMELINE */}
        <div className="rm-grid" style={{ width: gridW, minWidth: gridW }}>
          {/* cabeçalho de meses com agrupamento por ano */}
          <div className="rm-qhead">
            {(() => {
              const cells = [];
              let offset = 0;
              yearGroups.forEach((g) => {
                cells.push(
                  <div key={g.year} className="rm-ycell" style={{ width: g.span * MW, position: "relative" }}>
                    <div className="rm-ylabel">{g.year}</div>
                    <div style={{ display: "flex" }}>
                      {months.slice(offset, offset + g.span).map((m) => (
                        <div key={m.key} className="rm-qlabel" style={{ width: MW, fontSize: 11 }}>{MONTH_NAMES[m.month - 1]}</div>
                      ))}
                    </div>
                  </div>
                );
                offset += g.span;
              });
              return cells;
            })()}
          </div>

          {/* faixas */}
          <div className="rm-lanes" style={{ height: rowsH }}>
            {/* linhas verticais de mês */}
            {months.map((m, i) => <div key={m.key} className="rm-colline" style={{ left: (i + 1) * MW }} />)}

            {/* marcador HOJE */}
            {todayX != null && (
              <>
                <div className="rm-today" style={{ left: todayX * MW }} />
                <div className="rm-todaytag" style={{ left: todayX * MW }}>HOJE</div>
              </>
            )}

            {/* barras */}
            {(() => {
              let top = 0;
              return rows.map((r) => {
                const isEpic = r.kind === "epic";
                const h = isEpic ? ROW_EPIC : ROW_FEAT;
                const box = barBox(r.item._vis);
                const node = box && (
                  <div key={`bar-${r.kind}-${r.item.id}`} className="rm-grow" style={{ position: "absolute", top, left: 0, right: 0, height: h }}>
                    <div className="rm-bar"
                      style={{
                        left: box.left, width: box.width,
                        height: isEpic ? 26 : 20,
                        background: isEpic ? "#424449" : stateOf(r.item.state).bar,
                        color: "#fff",
                      }}
                      onClick={() => setSelected(isEpic ? r.item : { ...r.item, type: "Feature", epicTitle: r.epic.title })}
                      title={`${r.item.title} — ${stateOf(r.item.state).label}`}>
                      {isEpic && r.item.progress > 0 && <div className="rm-prog" style={{ width: `${r.item.progress * 100}%`, background: "rgba(255,61,3,.55)" }} />}
                      <span className="rm-barlabel" style={{ position: "relative" }}>{r.item.title}</span>
                    </div>
                  </div>
                );
                top += h;
                return node;
              });
            })()}
          </div>
        </div>

        {/* DRAWER DE DETALHES */}
        {selected && (
          <div className="rm-drawer">
            <button className="rm-dx" onClick={() => setSelected(null)}><X size={16} /></button>
            <div className="rm-dtype">{selected.type === "Feature" ? "Feature" : "Epic"}{selected.epicTitle ? ` · ${selected.epicTitle}` : ""}</div>
            <div className="rm-dtitle">{selected.title}</div>
            <div style={{ marginBottom: 10 }}>
              <span className="rm-pill" style={{ background: stateOf(selected.state).soft, color: stateOf(selected.state).bar }}>
                <span className="rm-chip" style={{ background: stateOf(selected.state).bar }} />{stateOf(selected.state).label}
              </span>
            </div>
            <div className="rm-frow"><span className="rm-flabel">ID</span><span className="rm-fval">#{selected.id}</span></div>
            <div className="rm-frow"><span className="rm-flabel">Responsável</span><span className="rm-fval">{selected.assigned_to || "Não atribuído"}</span></div>
            <div className="rm-frow"><span className="rm-flabel">Início</span><span className="rm-fval">{fmtDate(selected.start_date)}</span></div>
            <div className="rm-frow"><span className="rm-flabel">Alvo</span><span className="rm-fval">{fmtDate(selected.target_date)}</span></div>
            {selected.area_path && <div className="rm-frow"><span className="rm-flabel">Área</span><span className="rm-fval">{selected.area_path.split("\\").pop()}</span></div>}
            {typeof selected.progress === "number" && selected.type !== "Feature" && (
              <div className="rm-frow"><span className="rm-flabel">Progresso</span><span className="rm-fval">{Math.round(selected.progress * 100)}%</span></div>
            )}
            {selected.tags?.length > 0 && (
              <div style={{ paddingTop: 12 }}>
                <div className="rm-flabel" style={{ fontSize: 12, marginBottom: 6 }}>Tags</div>
                {selected.tags.map((t) => <span className="rm-tag" key={t}>{t}</span>)}
              </div>
            )}
            <a className="rm-link" href={API_BASE ? "#" : undefined} onClick={(e) => !API_BASE && e.preventDefault()}>
              Abrir no Azure DevOps <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>

      <div className="rm-foot">
        {rows.length ? `${epics.length} epics · ${rows.length - epics.length} features visíveis` : "Nenhum item para os filtros atuais"} ·
        atualizado {new Date(data.generated_at).toLocaleString("pt-BR")}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ================================================================== *
 *  ENTRY POINT — controla navegação landing ↔ roadmap
 * ================================================================== */
export default function App() {
  const [selectedProject, setSelectedProject] = useState(null);

  if (!selectedProject) {
    return <LandingPage onSelect={setSelectedProject} />;
  }

  return <PainelRoadmap project={selectedProject} onBack={() => setSelectedProject(null)} />;
}
