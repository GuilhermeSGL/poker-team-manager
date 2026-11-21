import { stats, settle, sessionProfit, openSessions, cumulative, round2 } from "./model.js";
import { demoData } from "./demo.js";

const KEY = "poker-team-manager:v1";
const COLORS = ["#34c38f", "#e3b341", "#5aa9e6", "#c77dff", "#f0706a", "#7bdff2"];
const $ = (sel) => document.querySelector(sel);

let db = load();
let chart;

// ---------------------------------------------------------------- dados
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* navegador sem storage: segue com a demo */ }
  return demoData();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignora */ }
  render();
}
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const playerById = (id) => db.players.find((p) => p.id === id);

// ---------------------------------------------------------------- formatação
const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
const money = (n) => usd.format(n);
const pct = (n) => (n * 100).toFixed(1).replace(".", ",") + "%";
const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (d) => d.split("-").reverse().join("/");

/** Situação atual do jogador: sessões abertas + makeup projetado se acertasse agora. */
function position(p) {
  const open = openSessions(db.sessions, p.id);
  const profit = stats(open).profit;
  return { open, profit, preview: settle({ makeup: p.makeup, profit, playerShare: p.share }) };
}

// ---------------------------------------------------------------- render
function render() {
  renderKpis();
  renderChart();
  renderPlayersTable();
  renderSessions();
  renderDeals();
  renderSettle();
  fillPlayerSelects();
}

function renderKpis() {
  const t = stats(db.sessions);
  const makeup = db.players.reduce((a, p) => a + Math.min(0, position(p).preview.makeupAfter), 0);
  const kpis = [
    ["Lucro do time", money(t.profit), `${t.sessions} sessões`, tone(t.profit)],
    ["ROI", pct(t.roi), `ABI ${money(t.abi)}`, tone(t.roi)],
    ["Volume", t.entries.toLocaleString("pt-BR"), `ITM ${pct(t.itmRate)}`, ""],
    ["Makeup em aberto", money(makeup), `${db.players.length} jogadores`, makeup < 0 ? "gold" : ""],
  ];
  $("#kpis").innerHTML = kpis.map(([label, value, sub, cls]) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`
  ).join("");
}

function renderChart() {
  if (!window.Chart) return; // sem internet para o CDN: o resto do painel funciona
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue("--muted").trim();
  const line = css.getPropertyValue("--line").trim();
  const datasets = db.players.map((p, i) => ({
    label: p.name,
    data: cumulative(db.sessions.filter((s) => s.playerId === p.id)).map((pt) => ({ x: pt.date, y: pt.value })),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length],
    borderWidth: 2, pointRadius: 0, tension: 0.25,
  }));
  if (chart) chart.destroy();
  chart = new Chart($("#chart"), {
    type: "line",
    data: { datasets },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      parsing: { xAxisKey: "x", yAxisKey: "y" },
      scales: {
        x: { type: "category", labels: [...new Set(db.sessions.map((s) => s.date))].sort(), ticks: { color: muted, maxTicksLimit: 8, callback(v) { return fmtDate(this.getLabelForValue(v)).slice(0, 5); } }, grid: { display: false } },
        y: { ticks: { color: muted, callback: (v) => "$" + v.toLocaleString("pt-BR") }, grid: { color: line } },
      },
      plugins: {
        legend: { labels: { color: muted, usePointStyle: true, boxHeight: 6 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } },
      },
    },
  });
}

function renderPlayersTable() {
  const rows = db.players.map((p) => {
    const s = stats(db.sessions.filter((x) => x.playerId === p.id));
    const mk = position(p).preview.makeupAfter;
    return `<tr><td>${esc(p.name)}</td><td class="num">${s.entries}</td><td class="num">${money(s.abi)}</td>
      <td class="num">${pct(s.itmRate)}</td><td class="num ${tone(s.profit)}">${money(s.profit)}</td>
      <td class="num ${tone(s.roi)}">${pct(s.roi)}</td><td class="num">${pct(p.share)}</td>
      <td class="num ${mk < 0 ? "gold" : ""}">${money(mk)}</td></tr>`;
  }).join("");
  $("#players-table").innerHTML = `<thead><tr><th>Jogador</th><th class="num">Torneios</th><th class="num">ABI</th>
    <th class="num">ITM</th><th class="num">Lucro</th><th class="num">ROI</th><th class="num">Deal</th><th class="num">Makeup</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderSessions() {
  const f = $("#filter-player").value;
  const list = db.sessions.filter((s) => !f || s.playerId === f).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  const rows = list.map((s) => {
    const r = sessionProfit(s);
    return `<tr><td>${fmtDate(s.date)}</td><td>${esc(playerById(s.playerId)?.name ?? "?")}</td><td>${esc(s.site)}</td>
      <td class="num">${s.entries}</td><td class="num">${s.itm}</td><td class="num">${money(s.buyins)}</td>
      <td class="num">${money(s.cashes)}</td><td class="num ${tone(r)}">${money(r)}</td>
      <td>${s.settlementId ? '<span class="muted">acertada</span>' : `<button class="del" data-del="${s.id}" title="Excluir">✕</button>`}</td></tr>`;
  }).join("");
  $("#sessions-table").innerHTML = `<thead><tr><th>Data</th><th>Jogador</th><th>Site</th><th class="num">Torneios</th><th class="num">ITM</th>
    <th class="num">Buy-ins</th><th class="num">Prêmios</th><th class="num">Resultado</th><th></th></tr></thead><tbody>${rows}</tbody>`;
}

function renderDeals() {
  const rows = db.players.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${pct(p.share)}</td>
    <td class="num">${pct(1 - p.share)}</td><td class="num ${p.makeup < 0 ? "gold" : ""}">${money(p.makeup)}</td></tr>`).join("");
  $("#deals-table").innerHTML = `<thead><tr><th>Jogador</th><th class="num">Jogador fica</th><th class="num">Time fica</th>
    <th class="num">Makeup do último acerto</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderSettle() {
  $("#settle-cards").innerHTML = db.players.map((p) => {
    const { open, profit, preview: r } = position(p);
    return `<div class="settle"><h3>${esc(p.name)}</h3>
      <div class="row"><span class="muted">Sessões em aberto</span><span>${open.length}</span></div>
      <div class="row"><span class="muted">Makeup anterior</span><span class="${p.makeup < 0 ? "gold" : ""}">${money(p.makeup)}</span></div>
      <div class="row"><span class="muted">Resultado do pacote</span><span class="${tone(profit)}">${money(profit)}</span></div>
      <div class="row"><span class="muted">Líquido</span><span class="${tone(r.net)}">${money(r.net)}</span></div>
      <div class="row"><span>Jogador recebe</span><span class="pos">${money(r.toPlayer)}</span></div>
      <div class="row"><span>Time recebe</span><span class="pos">${money(r.toBacker)}</span></div>
      <div class="row"><span>Makeup depois</span><span class="${r.makeupAfter < 0 ? "gold" : ""}">${money(r.makeupAfter)}</span></div>
      <button class="primary" data-settle="${p.id}" ${open.length ? "" : "disabled"}>Fechar acerto</button></div>`;
  }).join("") || '<p class="muted">Cadastre jogadores para fazer acertos.</p>';

  const rows = [...db.settlements].reverse().map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${esc(playerById(s.playerId)?.name ?? "?")}</td>
    <td class="num">${s.sessions}</td><td class="num ${tone(s.profit)}">${money(s.profit)}</td><td class="num">${money(s.toPlayer)}</td>
    <td class="num">${money(s.toBacker)}</td><td class="num ${s.makeupAfter < 0 ? "gold" : ""}">${money(s.makeupAfter)}</td></tr>`).join("");
  $("#settlements-table").innerHTML = rows
    ? `<thead><tr><th>Data</th><th>Jogador</th><th class="num">Sessões</th><th class="num">Resultado</th><th class="num">Jogador</th>
       <th class="num">Time</th><th class="num">Makeup</th></tr></thead><tbody>${rows}</tbody>`
    : '<tbody><tr><td class="muted">Nenhum acerto fechado ainda.</td></tr></tbody>';
}

function fillPlayerSelects() {
  const opts = db.players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const sel = $("#session-form [name=playerId]");
  const keep = sel.value;
  sel.innerHTML = opts;
  if (keep) sel.value = keep;
  const f = $("#filter-player");
  const fk = f.value;
  f.innerHTML = `<option value="">Todos os jogadores</option>${opts}`;
  f.value = fk;
}

// ---------------------------------------------------------------- ações
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
}));

$("#session-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  db.sessions.push({
    id: uid("s"), playerId: f.get("playerId"), date: f.get("date"), site: f.get("site").trim(),
    entries: +f.get("entries"), itm: +f.get("itm"), buyins: round2(+f.get("buyins")), cashes: round2(+f.get("cashes")),
  });
  e.target.reset();
  e.target.date.value = new Date().toISOString().slice(0, 10);
  save();
});

$("#player-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  db.players.push({ id: uid("p"), name: f.get("name").trim(), share: +f.get("share") / 100, makeup: Math.min(0, +f.get("makeup")) });
  e.target.reset();
  save();
});

$("#filter-player").addEventListener("change", renderSessions);

document.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del && confirm("Excluir esta sessão?")) {
    db.sessions = db.sessions.filter((s) => s.id !== del.dataset.del);
    save();
  }
  const st = e.target.closest("[data-settle]");
  if (st) {
    const p = playerById(st.dataset.settle);
    const { open, profit, preview: r } = position(p);
    if (!confirm(`Fechar o acerto de ${p.name}? Jogador recebe ${money(r.toPlayer)}, time recebe ${money(r.toBacker)}.`)) return;
    const id = uid("a");
    open.forEach((s) => (s.settlementId = id));
    p.makeup = r.makeupAfter;
    db.settlements.push({ id, playerId: p.id, date: new Date().toISOString().slice(0, 10), sessions: open.length, profit, ...r });
    save();
  }
});

$("#btn-export").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
  a.download = `time-poker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.players) || !Array.isArray(data.sessions)) throw new Error();
    db = { settlements: [], ...data };
    save();
  } catch {
    alert("Arquivo inválido: esperado um JSON exportado por este painel.");
  }
  e.target.value = "";
});

$("#btn-demo").addEventListener("click", () => {
  if (confirm("Substituir os dados atuais pela demonstração?")) { db = demoData(); save(); }
});

$("#session-form").date.value = new Date().toISOString().slice(0, 10);
render();
