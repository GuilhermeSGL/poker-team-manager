import { stats, settle, sessionProfit, openSessions, cumulative, round2 } from "./model.js";
import { demoData } from "./demo.js";
import { RATING_KEYS, STATUSES, weekStart, addDays, evaluateWeek, summaryText, ratingAverage, weeklyHistory } from "./team.js";
import { parseTransactions, toSessions } from "./importer.js";

const KEY = "poker-team-manager:v1";
const COLORS = ["#34c38f", "#e3b341", "#5aa9e6", "#c77dff", "#f0706a", "#7bdff2"];
const $ = (sel) => document.querySelector(sel);

let db = load();
let chart;

// ---------------------------------------------------------------- dados
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* navegador sem storage: segue com a demo */ }
  return normalize(demoData());
}
/** Garante os campos novos em dados salvos por versões anteriores. */
function normalize(d) {
  d.settlements ??= [];
  d.meetings ??= [];
  for (const p of d.players) {
    p.status ??= "Ativo";
    p.goals ??= { entries: 0 };
    p.ratings ??= {};
  }
  return d;
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
  renderTeam();
  renderWeek();
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
  db.players.push({
    id: uid("p"), name: f.get("name").trim(), nick: f.get("nick").trim(), profileName: f.get("profileName").trim(),
    share: +f.get("share") / 100, makeup: Math.min(0, +f.get("makeup")),
    status: "Ativo", goals: { entries: +f.get("goal") || 0 }, maxAbi: +f.get("maxAbi") || null, ratings: {},
  });
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
    db = normalize({ settlements: [], ...data });
    save();
  } catch {
    alert("Arquivo inválido: esperado um JSON exportado por este painel.");
  }
  e.target.value = "";
});

$("#btn-demo").addEventListener("click", () => {
  if (confirm("Substituir os dados atuais pela demonstração?")) { db = normalize(demoData()); save(); }
});

// ================================================================ gestão do time
const today = () => new Date().toISOString().slice(0, 10);
let selectedWeek = null;
let radarChart = null;
let profileId = null;
const importLog = [];
const pending = [];

function latestWeek() {
  const lastData = db.sessions.map((s) => s.date).sort().at(-1);
  const t = weekStart(today());
  return lastData && weekStart(lastData) > t ? weekStart(lastData) : t;
}
function weekOptions() {
  const last = latestWeek();
  return Array.from({ length: 16 }, (_, i) => addDays(last, -7 * i));
}
function currentWeek() {
  if (!selectedWeek) {
    // abre na última semana completa que tem dados (fechamento é da semana encerrada)
    const lastData = db.sessions.map((s) => s.date).sort().at(-1);
    const lastClosed = addDays(weekStart(today()), -7);
    selectedWeek = lastData && weekStart(lastData) < lastClosed ? weekStart(lastData) : lastClosed;
  }
  return selectedWeek;
}
function evalFor(p, week = currentWeek()) {
  const pos = position(p);
  return { ev: evaluateWeek({ player: p, sessions: db.sessions, meetings: db.meetings, week, makeupAfter: pos.preview.makeupAfter, today: today() }), makeup: pos.preview.makeupAfter };
}

function renderTeam() {
  const week = currentWeek();
  $("#team-grid").innerHTML = db.players.map((p) => {
    const { ev, makeup } = evalFor(p, week);
    const avg = ratingAverage(p.ratings);
    const pctGoal = ev.goalPct == null ? 0 : Math.min(1, ev.goalPct);
    return `<button class="pcard" data-profile="${p.id}">
      <div class="top-line"><div><div class="name">${esc(p.name)}</div><div class="nick">${esc(p.nick || "")}</div></div>
        <span class="status ${esc(p.status)}">${esc(p.status)}</span></div>
      <div class="row"><span class="muted"><span class="dot ${ev.light}"></span> Semana</span><span>${ev.cur.entries}${ev.goal ? " / " + ev.goal : ""} torneios</span></div>
      <div class="bar"><span style="width:${Math.round(pctGoal * 100)}%"></span></div>
      <div class="row"><span class="muted">Resultado</span><span class="${tone(ev.cur.profit)}">${money(ev.cur.profit)}</span></div>
      <div class="row"><span class="muted">Makeup</span><span class="${makeup < 0 ? "gold" : ""}">${money(makeup)}</span></div>
      <div class="row"><span class="muted">Evolução</span><span>${avg == null ? "—" : avg.toFixed(1).replace(".", ",") + " / 10"}</span></div>
      ${ev.alerts.length ? `<div class="alert-count">⚠ ${ev.alerts.length} ponto(s) de atenção</div>` : ""}
    </button>`;
  }).join("") || '<p class="muted">Cadastre jogadores na aba Jogadores.</p>';
}

function renderWeek() {
  const week = currentWeek();
  const sel = $("#week-select");
  sel.innerHTML = weekOptions().map((w) => `<option value="${w}">Semana ${fmtDate(w)} a ${fmtDate(addDays(w, 6))}</option>`).join("");
  if (![...sel.options].some((o) => o.value === week)) sel.insertAdjacentHTML("beforeend", `<option value="${week}">Semana ${fmtDate(week)}</option>`);
  sel.value = week;

  const rows = db.players.filter((p) => p.status !== "Inativo").map((p) => {
    const { ev, makeup } = evalFor(p, week);
    const c = ev.cur;
    return `<tr><td><b>${esc(p.nick || p.name)}</b><br><span class="status ${esc(p.status)}">${esc(p.status)}</span></td>
      <td class="num"><span class="dot ${ev.light}"></span> ${c.entries}${ev.goal ? " / " + ev.goal : ""}</td>
      <td class="num">${pct(c.itmRate)}</td><td class="num">${money(c.abi)}</td>
      <td class="num ${tone(c.roi)}">${pct(c.roi)}</td><td class="num ${tone(c.profit)}">${money(c.profit)}</td>
      <td class="num ${makeup < 0 ? "gold" : ""}">${money(makeup)}</td>
      <td class="alerts">${ev.alerts.length ? `<ul>${ev.alerts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "Tudo certo ✓"}</td>
      <td><button class="ghost" data-copy="${p.id}">Copiar resumo</button></td></tr>`;
  }).join("");
  $("#week-table").innerHTML = `<thead><tr><th>Player</th><th class="num">Torneios / meta</th><th class="num">ITM</th><th class="num">ABI</th>
    <th class="num">ROI</th><th class="num">Resultado</th><th class="num">Makeup</th><th>Avaliação</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  renderImportLog();
}

function renderImportLog() {
  const opts = db.players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const parts = importLog.map((l) => `<div>${l}</div>`);
  pending.forEach((it, i) => parts.push(`<div class="match">Perfil <b>${esc(it.report.profile || "sem nome")}</b> (${esc(it.file)}): associar a
    <select data-pending-sel="${i}">${opts}</select><button class="primary" data-pending="${i}">Importar</button></div>`));
  $("#import-log").innerHTML = parts.length ? `<div class="log">${parts.join("")}</div>` : "";
}

function findPlayer(profile) {
  const n = profile.trim().toLowerCase();
  if (!n) return null;
  return db.players.find((p) => [p.profileName, p.name, p.nick].some((v) => (v || "").trim().toLowerCase() === n)) || null;
}

function applyImport(report, player, file) {
  const known = new Set(db.sessions.filter((s) => s.playerId === player.id).flatMap((s) => s.refs || []));
  const fresh = { ...report, tournaments: report.tournaments.filter((t) => !known.has(t.ref)) };
  const sessions = toSessions(fresh, player.id).map((s) => ({ id: uid("s"), ...s }));
  db.sessions.push(...sessions);
  if (!player.profileName && report.profile) player.profileName = report.profile;
  const s = stats(sessions);
  const skipped = report.tournaments.length - fresh.tournaments.length;
  importLog.unshift(`✓ <b>${esc(player.nick || player.name)}</b> · ${esc(file)}: ${s.entries} entradas, resultado <span class="${tone(s.profit)}">${money(s.profit)}</span>`
    + (skipped ? ` · ${skipped} torneio(s) já importados ignorados` : "") + (report.bonus ? ` · bônus/rakeback ${money(report.bonus)} (fora do resultado)` : ""));
  if (report.start) selectedWeek = weekStart(report.start);
  else if (sessions[0]) selectedWeek = weekStart(sessions[0].date);
}

async function readSheetRows(file) {
  if (!window.XLSX) throw new Error("leitor de planilhas não carregou (verifique a internet)");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
}

$("#report-import").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    try {
      const report = parseTransactions(await readSheetRows(file));
      const player = findPlayer(report.profile);
      if (player) applyImport(report, player, file.name);
      else pending.push({ file: file.name, report });
    } catch (err) {
      importLog.unshift(`✕ ${esc(file.name)}: ${esc(err.message)}`);
    }
  }
  e.target.value = "";
  save();
});

$("#week-select").addEventListener("change", (e) => { selectedWeek = e.target.value; render(); });

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Resumo copiado"); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Resumo copiado");
  }
}
function playerSummary(p) {
  const { ev, makeup } = evalFor(p);
  return summaryText(p, ev, currentWeek(), makeup);
}
$("#copy-team").addEventListener("click", () => {
  const ps = db.players.filter((p) => p.status !== "Inativo");
  const t = stats(db.sessions.filter((s) => ps.some((p) => p.id === s.playerId) && weekStart(s.date) === currentWeek()));
  const head = `*Time — semana ${fmtDate(currentWeek())} a ${fmtDate(addDays(currentWeek(), 6))}*\nTorneios: ${t.entries} · Resultado: ${money(t.profit)} · ROI: ${pct(t.roi)}`;
  copy([head, ...ps.map(playerSummary)].join("\n\n"));
});

// ---------------------------------------------------------------- ficha do player
function openProfile(id) {
  profileId = id;
  renderProfile();
  const d = $("#profile");
  if (!d.open) d.showModal();
}

function renderProfile() {
  const p = playerById(profileId);
  if (!p) return;
  const hist = weeklyHistory(db.sessions, p.id, 8, latestWeek());
  const meetings = db.meetings.filter((m) => m.playerId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const avg = ratingAverage(p.ratings);
  $("#profile-body").innerHTML = `
    <h2 id="pf-title" style="font-size:20px">${esc(p.name)} <span class="muted">${esc(p.nick || "")}</span></h2>
    <div class="row" style="justify-content:flex-start;gap:16px;margin-top:4px">
      <span class="status ${esc(p.status)}">${esc(p.status)}</span>
      <span class="muted">Deal ${pct(p.share)} · Makeup ${money(position(p).preview.makeupAfter)} · Evolução ${avg == null ? "—" : avg.toFixed(1).replace(".", ",")}</span>
    </div>
    <div class="pf-grid">
      <div>
        <h3>Dados e metas</h3>
        <form id="pf-form" class="form-inline">
          <label>Nick<input name="nick" value="${esc(p.nick || "")}"></label>
          <label>Perfil no site<input name="profileName" value="${esc(p.profileName || "")}"></label>
          <label>Status<select name="status">${STATUSES.map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label>Meta semanal (torneios)<input type="number" min="0" name="goal" value="${p.goals?.entries || 0}"></label>
          <label>ABI máximo (US$)<input type="number" min="0" step="0.01" name="maxAbi" value="${p.maxAbi ?? ""}"></label>
          <label>Deal do player (%)<input type="number" min="0" max="100" name="share" value="${Math.round(p.share * 100)}"></label>
          <button class="primary">Salvar</button>
        </form>
        <h3 style="margin-top:18px">Últimas semanas</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Semana</th><th class="num">Torneios</th><th class="num">Meta</th><th class="num">ABI</th><th class="num">ROI</th><th class="num">Resultado</th></tr></thead>
          <tbody>${hist.map((w) => `<tr><td>${fmtDate(w.week).slice(0, 5)}</td><td class="num">${w.entries}</td>
            <td class="num">${p.goals?.entries ? Math.round((w.entries / p.goals.entries) * 100) + "%" : "—"}</td>
            <td class="num">${money(w.abi)}</td><td class="num ${tone(w.roi)}">${pct(w.roi)}</td>
            <td class="num ${tone(w.profit)}">${money(w.profit)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Evolução técnica (1 a 10)</h3>
        <div class="radar-wrap"><canvas id="radar"></canvas></div>
        <div class="ratings">${RATING_KEYS.map((k) => `<label><span>${k}</span>
          <input type="range" min="1" max="10" step="1" data-rating="${k}" value="${p.ratings[k] ?? 5}">
          <b data-rating-val="${k}">${p.ratings[k] ?? "—"}</b></label>`).join("")}</div>
        <h3 style="margin-top:18px">Reuniões</h3>
        <form id="mt-form" class="form-inline">
          <label>Data<input type="date" name="date" value="${today()}" required></label>
          <label>Tema<input name="topic" required></label>
          <label style="grid-column:1/-1">Próximos passos<input name="nextSteps"></label>
          <button class="primary">Registrar reunião</button>
        </form>
        <div class="meetings" style="margin-top:10px">${meetings.map((m) => `<div class="meeting"><b>${fmtDate(m.date)}</b> · ${esc(m.topic)}
          ${m.nextSteps ? `<div class="muted">→ ${esc(m.nextSteps)}</div>` : ""}</div>`).join("") || '<span class="muted">Nenhuma reunião registrada.</span>'}</div>
      </div>
    </div>`;
  drawRadar(p);
}

function drawRadar(p) {
  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim();
  const muted = css.getPropertyValue("--muted").trim();
  const line = css.getPropertyValue("--line").trim();
  if (radarChart) radarChart.destroy();
  radarChart = new Chart($("#radar"), {
    type: "radar",
    data: { labels: RATING_KEYS, datasets: [{ data: RATING_KEYS.map((k) => p.ratings[k] ?? 0), borderColor: accent, backgroundColor: accent + "40", pointRadius: 2 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { r: { min: 0, max: 10, ticks: { display: false, stepSize: 2 }, grid: { color: line }, angleLines: { color: line }, pointLabels: { color: muted, font: { size: 10 } } } },
    },
  });
}

$("#profile").addEventListener("submit", (e) => {
  const p = playerById(profileId);
  if (e.target.id === "pf-form") {
    e.preventDefault();
    const f = new FormData(e.target);
    Object.assign(p, {
      nick: f.get("nick").trim(), profileName: f.get("profileName").trim(), status: f.get("status"),
      goals: { ...p.goals, entries: +f.get("goal") || 0 }, maxAbi: +f.get("maxAbi") || null,
      share: Math.min(1, Math.max(0, +f.get("share") / 100)),
    });
    save(); renderProfile(); toast("Ficha salva");
  }
  if (e.target.id === "mt-form") {
    e.preventDefault();
    const f = new FormData(e.target);
    db.meetings.push({ id: uid("m"), playerId: p.id, date: f.get("date"), topic: f.get("topic").trim(), nextSteps: f.get("nextSteps").trim() });
    save(); renderProfile(); toast("Reunião registrada");
  }
});
$("#profile").addEventListener("input", (e) => {
  const k = e.target.dataset.rating;
  if (!k) return;
  const p = playerById(profileId);
  p.ratings[k] = +e.target.value;
  $(`[data-rating-val="${CSS.escape(k)}"]`).textContent = e.target.value;
  if (radarChart) { radarChart.data.datasets[0].data = RATING_KEYS.map((x) => p.ratings[x] ?? 0); radarChart.update("none"); }
});
$("#profile").addEventListener("change", (e) => { if (e.target.dataset.rating) save(); });

document.addEventListener("click", (e) => {
  const pc = e.target.closest("[data-profile]");
  if (pc) openProfile(pc.dataset.profile);
  const cp = e.target.closest("[data-copy]");
  if (cp) copy(playerSummary(playerById(cp.dataset.copy)));
  const pd = e.target.closest("[data-pending]");
  if (pd) {
    const i = +pd.dataset.pending;
    const it = pending[i];
    const player = playerById($(`[data-pending-sel="${i}"]`).value);
    pending.splice(i, 1);
    applyImport(it.report, player, it.file);
    save();
  }
});

$("#session-form").date.value = new Date().toISOString().slice(0, 10);
render();
