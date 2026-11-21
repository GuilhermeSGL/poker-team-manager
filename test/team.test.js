import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTransactions, toSessions, classify, toISODate } from "../js/importer.js";
import { weekStart, evaluateWeek, summaryText, ratingAverage, light, weeklyHistory } from "../js/team.js";

// Mesmo layout do Transactions Report da Ignition (cabeçalho, perfil, período e colunas)
const REPORT = [
  ["Transactions Report"],
  ["Profile", " Player Teste"],
  ["Starting Date", "Ending Date"],
  [new Date(2026, 9, 5, 3, 45), new Date(2026, 9, 12, 3, 41)],
  [],
  ["Date", "Description", "Reference", "Cash\nAmount", "Bonus\nAmount", "Points", "Cash\nBefore", "Cash\nAfter"],
  [new Date(2026, 9, 11, 22, 0), "Poker Multi Table Tournament Cashout/Payout", "T3", 0, 0, null, 50, 50],
  [new Date(2026, 9, 11, 20, 0), "Poker Multi Table Tournament Buy-In", "T3", -11, 0, null, 61, 50],
  [new Date(2026, 9, 10, 23, 0), "Poker Multi Table Tournament Cashout/Payout", "T2", 120.5, 0, 30, 0, 120.5],
  [new Date(2026, 9, 10, 21, 0), "Poker Multi Table Tournament Buy-In", "T2", -5.5, 0, null, 10, 4.5],
  [new Date(2026, 9, 10, 21, 30), "Poker Multi Table Tournament Buy-In", "T2", -5.5, 0, null, 4.5, 0],
  [new Date(2026, 9, 10, 20, 0), "Poker Multi Table Tournament Buy-In", "T1", -8, -2, null, 20, 10],
  [new Date(2026, 9, 10, 13, 0), "Deposit Player Transfer", "850451689", 100, 0, null, 10, 110],
  [new Date(2026, 9, 9, 13, 0), "Bonus Rewarded", "B1", 3.25, 0, null, 0, 3.25],
];

test("classifica as linhas do relatório", () => {
  assert.equal(classify("Poker Multi Table Tournament Buy-In"), "entry");
  assert.equal(classify("Poker Multi Table Tournament Cashout/Payout"), "prize");
  assert.equal(classify("Withdrawal - Processed Player Transfer"), "bankroll");
  assert.equal(classify("Poker Free Roll"), "freeroll");
  assert.equal(classify("Points expired"), "other");
});

test("toISODate aceita Date, ISO e dd/mm/aaaa", () => {
  assert.equal(toISODate(new Date(2026, 9, 5, 3)), "2026-10-05");
  assert.equal(toISODate("2026-10-05 03:45:00"), "2026-10-05");
  assert.equal(toISODate("05/10/2026"), "2026-10-05");
});

test("parseTransactions soma custo, prêmio e re-entradas por torneio", () => {
  const r = parseTransactions(REPORT);
  assert.equal(r.profile, "Player Teste");
  assert.equal(r.start, "2026-10-05");
  const byRef = Object.fromEntries(r.tournaments.map((t) => [t.ref, t]));
  assert.deepEqual([byRef.T2.entries, byRef.T2.cost, byRef.T2.prize], [2, 11, 120.5]);
  assert.equal(byRef.T1.cost, 10); // dinheiro + bônus usado no buy-in
  assert.equal(byRef.T1.prize, 0); // ainda sem cashout: continua contando o custo
  assert.equal(r.bonus, 3.25);
  assert.equal(r.bankrollMoves, 1);
  assert.equal(r.tournaments.length, 3);
});

test("relatório sem cabeçalho dá erro claro", () => {
  assert.throws(() => parseTransactions([["qualquer coisa"]]), /cabeçalho/);
});

test("toSessions agrupa por dia", () => {
  const s = toSessions(parseTransactions(REPORT), "p1");
  assert.equal(s.length, 2);
  const d10 = s.find((x) => x.date === "2026-10-10");
  assert.deepEqual([d10.entries, d10.itm, d10.buyins, d10.cashes], [3, 1, 21, 120.5]);
  assert.deepEqual(d10.refs.sort(), ["T1", "T2"]);
});

test("freeroll entra no resultado mas não no ITM", () => {
  const rows = [...REPORT, [new Date(2026, 9, 10, 9, 0), "Poker Free Roll", "F1", 5.14, 0, null, 0, 5.14]];
  const d10 = toSessions(parseTransactions(rows), "p1").find((x) => x.date === "2026-10-10");
  assert.equal(d10.cashes, 125.64);
  assert.equal(d10.itm, 1);
});

test("weekStart devolve a segunda-feira", () => {
  assert.equal(weekStart("2026-10-11"), "2026-10-05"); // domingo
  assert.equal(weekStart("2026-10-05"), "2026-10-05");
});

test("semáforo da meta", () => {
  assert.equal(light(0.85), "green");
  assert.equal(light(0.7), "yellow");
  assert.equal(light(0.3), "red");
  assert.equal(light(null), "none");
});

const player = { id: "p1", name: "Teste", nick: "Tst", goals: { entries: 50 }, maxAbi: 10, status: "Ativo" };
const ses = (date, entries, buyins, cashes) => ({ playerId: "p1", date, entries, itm: 0, buyins, cashes });

test("avaliação aponta volume baixo, ABI alto, makeup e falta de reunião", () => {
  const sessions = [ses("2026-09-29", 60, 600, 700), ses("2026-10-06", 20, 300, 100)];
  const ev = evaluateWeek({ player, sessions, meetings: [], week: "2026-10-05", makeupAfter: -200 });
  assert.equal(ev.cur.entries, 20);
  assert.equal(ev.light, "red");
  const text = ev.alerts.join(" | ");
  assert.match(text, /40% da meta/);
  assert.match(text, /caiu mais da metade/);
  assert.match(text, /ABI de US\$ 15,00 acima do combinado \(US\$ 10,00\)/);
  assert.match(text, /Makeup/);
  assert.match(text, /Nenhuma reunião/);
});

test("semana boa e reunião recente não geram alertas", () => {
  const sessions = [ses("2026-10-06", 45, 400, 520)];
  const meetings = [{ playerId: "p1", date: "2026-10-01" }];
  const ev = evaluateWeek({ player, sessions, meetings, week: "2026-10-05", makeupAfter: 0 });
  assert.equal(ev.light, "green");
  assert.deepEqual(ev.alerts, []);
});

test("semana em andamento usa meta proporcional", () => {
  // quarta-feira (3º dia): meta 50 → ~21 esperados; 20 jogados está no ritmo
  const sessions = [ses("2026-10-06", 20, 200, 150)];
  const meetings = [{ playerId: "p1", date: "2026-10-01" }];
  const ok = evaluateWeek({ player, sessions, meetings, week: "2026-10-05", today: "2026-10-07" });
  assert.equal(ok.ongoing, true);
  assert.equal(ok.light, "green");
  assert.equal(ok.alerts.filter((a) => /meta|Ritmo/.test(a)).length, 0);
  const slow = evaluateWeek({ player, sessions: [ses("2026-10-06", 5, 50, 0)], meetings, week: "2026-10-05", today: "2026-10-09" });
  assert.match(slow.alerts.join(), /Ritmo abaixo da meta: 5 de 36/);
});

test("resumo traz números e alertas", () => {
  const ev = evaluateWeek({ player, sessions: [ses("2026-10-06", 20, 300, 100)], week: "2026-10-05", makeupAfter: -200 });
  const t = summaryText(player, ev, "2026-10-05", -200);
  assert.match(t, /05\/10\/2026 a 11\/10\/2026 — Tst/);
  assert.match(t, /Torneios: 20 de 50/);
  assert.match(t, /Resultado: -US\$ 200,00/);
  assert.match(t, /Pontos de atenção/);
});

test("média das notas e histórico semanal", () => {
  assert.equal(ratingAverage({ "Pré-flop": 6, ICM: 8 }), 7);
  assert.equal(ratingAverage({}), null);
  const h = weeklyHistory([ses("2026-10-06", 20, 300, 100), ses("2026-09-30", 10, 100, 0)], "p1", 3);
  assert.deepEqual(h.map((w) => [w.week, w.entries]), [["2026-10-05", 20], ["2026-09-28", 10], ["2026-09-21", 0]]);
});
