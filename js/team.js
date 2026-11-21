// Gestão do time: semanas, metas, semáforo, alertas e resumo para enviar ao player.
import { stats, round2 } from "./model.js";

export const RATING_KEYS = [
  "Pré-flop", "Pós-flop", "ICM", "Push/Fold", "Blind War", "Mental Game",
  "Organização", "Disciplina", "Comunicação", "Volume", "Comprometimento",
];
export const STATUSES = ["Ativo", "Atenção", "Crítico", "Inativo"];

/** Segunda-feira (YYYY-MM-DD) da semana de uma data. */
export function weekStart(dateISO) {
  const d = new Date(dateISO + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateISO, n) {
  const d = new Date(dateISO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
}

export function sessionsInWeek(sessions, playerId, week) {
  const end = addDays(week, 7);
  return sessions.filter((s) => s.playerId === playerId && s.date >= week && s.date < end);
}

/** Histórico semanal do jogador (semana mais recente primeiro). */
export function weeklyHistory(sessions, playerId, weeks = 8, upTo) {
  const last = upTo || weekStart(sessions.filter((s) => s.playerId === playerId).map((s) => s.date).sort().at(-1) || new Date().toISOString().slice(0, 10));
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(last, -7 * i);
    return { week: w, ...stats(sessionsInWeek(sessions, playerId, w)) };
  });
}

export function light(pct) {
  if (pct == null) return "none";
  return pct >= 0.8 ? "green" : pct >= 0.6 ? "yellow" : "red";
}

export function ratingAverage(ratings = {}) {
  const v = RATING_KEYS.map((k) => ratings[k]).filter((x) => typeof x === "number");
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/**
 * Avaliação da semana de um jogador.
 * `makeupAfter` é o makeup projetado (<= 0) considerando as sessões ainda não acertadas.
 */
export function evaluateWeek({ player, sessions, meetings = [], week, makeupAfter = 0, today }) {
  const cur = stats(sessionsInWeek(sessions, player.id, week));
  const prev = stats(sessionsInWeek(sessions, player.id, addDays(week, -7)));
  const goal = player.goals?.entries || 0;
  const goalPct = goal ? cur.entries / goal : null;
  // semana em andamento: compara com a meta proporcional aos dias que já passaram
  const ongoing = Boolean(today && today >= week && today < addDays(week, 7));
  const elapsed = ongoing ? daysBetween(week, today) + 1 : 7;
  const expected = goal ? Math.max(1, Math.round((goal * elapsed) / 7)) : 0;
  const pace = goal ? cur.entries / expected : null;
  const alerts = [];

  if (player.status === "Inativo") return { cur, prev, goal, goalPct, pace, ongoing, light: "none", alerts };

  if (cur.entries === 0 && (!ongoing || elapsed >= 3)) alerts.push(ongoing ? `Ainda não jogou nesta semana (${elapsed} dias).` : "Não jogou nesta semana.");
  else if (pace != null && pace < 0.6 && cur.entries > 0) {
    alerts.push(ongoing
      ? `Ritmo abaixo da meta: ${cur.entries} de ${expected} torneios esperados até hoje.`
      : `Volume em ${Math.round(goalPct * 100)}% da meta (${cur.entries}/${goal}).`);
  }
  if (!ongoing && prev.entries >= 10 && cur.entries > 0 && cur.entries < prev.entries * 0.5) {
    alerts.push(`Volume caiu mais da metade em relação à semana anterior (${prev.entries} → ${cur.entries}).`);
  }
  if (player.maxAbi && cur.abi > player.maxAbi * 1.2) {
    alerts.push(`ABI de ${money(cur.abi)} acima do combinado (${money(player.maxAbi)}).`);
  }
  if (cur.profit < 0 && makeupAfter < 0) {
    alerts.push(`Makeup em ${money(makeupAfter)} depois de uma semana de ${money(cur.profit)}.`);
  }
  const lastMeeting = meetings.filter((m) => m.playerId === player.id).map((m) => m.date).sort().at(-1);
  const ref = today || addDays(week, 6);
  if (!lastMeeting) alerts.push("Nenhuma reunião registrada.");
  else if (daysBetween(lastMeeting, ref) > 14) alerts.push(`Sem reunião há ${daysBetween(lastMeeting, ref)} dias.`);

  return { cur, prev, goal, goalPct, pace, ongoing, light: light(pace), alerts };
}

function money(n) {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + "US$ " + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}
const pct = (n) => (n * 100).toFixed(1).replace(".", ",") + "%";
const br = (iso) => iso.split("-").reverse().join("/");

/** Texto pronto para mandar no WhatsApp/Discord. */
export function summaryText(player, ev, week, makeupAfter) {
  const c = ev.cur;
  const lines = [
    `*${ev.ongoing ? "Parcial" : "Fechamento"} da semana ${br(week)} a ${br(addDays(week, 6))} — ${player.nick || player.name}*`,
    `Torneios: ${c.entries}${ev.goal ? ` de ${ev.goal} (${Math.round((ev.goalPct || 0) * 100)}% da meta)` : ""}`,
    `Investido: ${money(c.buyins)} · Prêmios: ${money(c.cashes)}`,
    `Resultado: ${money(c.profit)} · ROI: ${pct(c.roi)} · ABI: ${money(c.abi)} · ITM: ${pct(c.itmRate)}`,
    `Makeup atual: ${money(makeupAfter)}`,
  ];
  if (ev.prev.entries) lines.push(`Semana anterior: ${ev.prev.entries} torneios, ${money(ev.prev.profit)}`);
  if (ev.alerts.length) lines.push("", "Pontos de atenção:", ...ev.alerts.map((a) => `• ${a}`));
  return lines.join("\n");
}
