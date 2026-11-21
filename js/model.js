// Regras de negócio do time: estatísticas por jogador e acerto de stake com makeup.
// Funções puras (sem DOM) para poderem ser testadas com `node --test`.

/** Resultado de uma sessão: prêmios menos buy-ins (inclui rebuys/add-ons no total de buy-ins). */
export function sessionProfit(s) {
  return round2((s.cashes || 0) - (s.buyins || 0));
}

/**
 * Estatísticas de um conjunto de sessões.
 * ROI = lucro / total investido. ABI = buy-in médio por torneio. ITM = % de torneios premiados.
 */
export function stats(sessions) {
  const t = sessions.reduce(
    (a, s) => {
      a.buyins += s.buyins || 0;
      a.cashes += s.cashes || 0;
      a.entries += s.entries || 0;
      a.itm += s.itm || 0;
      return a;
    },
    { buyins: 0, cashes: 0, entries: 0, itm: 0 }
  );
  const profit = round2(t.cashes - t.buyins);
  return {
    sessions: sessions.length,
    entries: t.entries,
    buyins: round2(t.buyins),
    cashes: round2(t.cashes),
    profit,
    roi: t.buyins > 0 ? profit / t.buyins : 0,
    abi: t.entries > 0 ? t.buyins / t.entries : 0,
    itmRate: t.entries > 0 ? t.itm / t.entries : 0,
  };
}

/**
 * Acerto de um pacote de stake.
 * - `makeup` é o saldo negativo acumulado (número <= 0) que o jogador deve ao time.
 * - O lucro do período primeiro abate o makeup; só o que sobra é dividido.
 * - `playerShare` é a fração do lucro líquido que fica com o jogador (ex.: 0.5 = 50%).
 */
export function settle({ makeup = 0, profit, playerShare }) {
  if (makeup > 0) throw new Error("makeup deve ser zero ou negativo");
  if (playerShare < 0 || playerShare > 1) throw new Error("playerShare deve estar entre 0 e 1");
  const net = round2(makeup + profit);
  if (net <= 0) {
    return { net, toPlayer: 0, toBacker: 0, makeupAfter: net };
  }
  const toPlayer = round2(net * playerShare);
  return { net, toPlayer, toBacker: round2(net - toPlayer), makeupAfter: 0 };
}

/** Sessões de um jogador ainda não incluídas em nenhum acerto. */
export function openSessions(sessions, playerId) {
  return sessions.filter((s) => s.playerId === playerId && !s.settlementId);
}

/** Lucro acumulado ao longo do tempo (para o gráfico), ordenado por data. */
export function cumulative(sessions) {
  let acc = 0;
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, value: (acc = round2(acc + sessionProfit(s))) }));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}
