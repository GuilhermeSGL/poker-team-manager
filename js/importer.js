// Leitura do "Transactions Report" (Ignition / Bodog) exportado em planilha.
// Recebe as linhas já lidas (array de arrays) para funcionar igual no navegador e nos testes.

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const num = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, "")) || 0);
const round2 = (n) => Math.round(n * 100) / 100;

export function toISODate(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? "");
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
}

/** Tipo de cada linha a partir da descrição. */
export function classify(description) {
  const d = norm(description);
  if (/tournament.*(cash ?out|payout)/.test(d)) return "prize";
  if (/tournament.*(unregist|refund|cancel)/.test(d)) return "refund";
  if (/tournament.*(re-?entry)/.test(d)) return "entry";
  if (/tournament.*(rebuy|re-buy|add-?on)/.test(d)) return "rebuy";
  if (/tournament.*buy-?in/.test(d)) return "entry";
  if (/free ?roll/.test(d)) return "freeroll";
  if (/deposit|withdrawal|transfer/.test(d)) return "bankroll";
  if (/bonus rewarded|cashback|rakeback|reward/.test(d)) return "bonus";
  return "other";
}

/**
 * Converte o relatório em torneios e totais.
 * Custo de um torneio = buy-ins + rebuys (dinheiro + bônus usados); prêmio = cashouts.
 */
export function parseTransactions(rows) {
  let profile = "", start = "", end = "", h = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i] || [];
    if (norm(r[0]) === "profile") profile = String(r[1] ?? "").trim();
    if (norm(r[0]) === "starting date" && rows[i + 1]) {
      start = toISODate(rows[i + 1][0]);
      end = toISODate(rows[i + 1][1]);
    }
    if (norm(r[0]) === "date" && norm(r[1]) === "description") { h = i; break; }
  }
  if (h < 0) throw new Error("Não encontrei o cabeçalho 'Date / Description'. É um Transactions Report?");

  const header = rows[h].map(norm);
  const col = (name) => header.findIndex((c) => c.startsWith(name));
  const ci = { date: 0, desc: 1, ref: col("reference"), cash: col("cash amount"), bonus: col("bonus amount") };
  if (ci.cash < 0) throw new Error("Coluna 'Cash Amount' não encontrada.");

  const tournaments = new Map();
  const t = (ref, date) => {
    if (!tournaments.has(ref)) tournaments.set(ref, { ref, date, cost: 0, prize: 0, entries: 0 });
    return tournaments.get(ref);
  };
  let bonus = 0, bankroll = 0, ignored = 0;

  for (const r of rows.slice(h + 1)) {
    if (!r || r[ci.desc] == null) continue;
    const kind = classify(r[ci.desc]);
    const amount = num(r[ci.cash]) + (ci.bonus >= 0 ? num(r[ci.bonus]) : 0);
    const ref = String(r[ci.ref] ?? "").trim() || `linha-${tournaments.size}`;
    const date = toISODate(r[ci.date]);
    switch (kind) {
      case "entry": { const x = t(ref, date); x.cost += -amount; x.entries += 1; if (date < x.date) x.date = date; break; }
      case "rebuy": t(ref, date).cost += -amount; break;
      case "refund": { const x = t(ref, date); x.cost -= amount; x.entries = Math.max(0, x.entries - 1); break; }
      case "prize": t(ref, date).prize += amount; break;
      case "freeroll": if (amount > 0) t(ref, date).prize += amount; break;
      case "bonus": bonus += amount; break;
      case "bankroll": bankroll += 1; break;
      default: ignored += 1;
    }
  }

  const list = [...tournaments.values()]
    .map((x) => ({ ...x, cost: round2(x.cost), prize: round2(x.prize) }))
    .filter((x) => x.entries > 0 || x.prize > 0 || x.cost > 0);
  return { profile, start, end, tournaments: list, bonus: round2(bonus), bankrollMoves: bankroll, ignored };
}

/** Agrupa os torneios por dia no formato de sessão do painel. */
export function toSessions(report, playerId, site = "Ignition") {
  const byDay = new Map();
  for (const x of report.tournaments) {
    const s = byDay.get(x.date) || { playerId, date: x.date, site, entries: 0, itm: 0, buyins: 0, cashes: 0, refs: [] };
    s.entries += x.entries;
    s.itm += x.prize > 0 && x.entries > 0 ? 1 : 0; // freeroll soma prêmio, mas não conta no ITM
    s.buyins = round2(s.buyins + x.cost);
    s.cashes = round2(s.cashes + x.prize);
    s.refs.push(x.ref);
    byDay.set(x.date, s);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
