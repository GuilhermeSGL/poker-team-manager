// Dados fictícios para a demonstração (jogadores e resultados inventados).

function rng(seed) {
  // gerador determinístico simples (mulberry32) para a demo ficar igual sempre
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoData(seed = 5) {
  const players = [
    { id: "p1", name: "Ana \"Shark\"", share: 0.5, makeup: 0, abi: 22, edge: 0.18 },
    { id: "p2", name: "Bruno Grinder", share: 0.4, makeup: -1200, abi: 11, edge: 0.08 },
    { id: "p3", name: "Carla MTT", share: 0.5, makeup: 0, abi: 33, edge: 0.25 },
    { id: "p4", name: "Diego Rookie", share: 0.3, makeup: -350, abi: 5.5, edge: -0.05 },
  ];
  const sites = ["GGPoker", "PokerStars", "888poker", "WPT Global"];
  const r = rng(seed);
  const sessions = [];
  const start = new Date("2026-08-01T00:00:00Z");
  let n = 0;
  for (let d = 0; d < 110; d += 1) {
    for (const p of players) {
      if (r() < 0.45) continue; // nem todo mundo joga todo dia
      const entries = 10 + Math.floor(r() * 25);
      const buyins = Math.round(entries * p.abi * (0.8 + r() * 0.4) * 100) / 100;
      // variância típica de MTT: a maioria dos dias negativa, alguns picos grandes
      const spike = r() < 0.05 ? 5 + r() * 12 : 0;
      const mult = (1 + p.edge) * (0.3 + r() * 0.8 + spike * (r() < 0.5 ? 1 : 0));
      const cashes = Math.round(buyins * mult * 100) / 100;
      const itm = Math.round(entries * (0.1 + r() * 0.1));
      const date = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
      sessions.push({ id: `s${++n}`, playerId: p.id, date, site: sites[Math.floor(r() * sites.length)], entries, itm, buyins, cashes });
    }
  }
  // gestão: nick, status, metas, ABI combinado e notas de evolução (1 a 10)
  const extra = {
    p1: { nick: "AnaShark", status: "Ativo", goals: { entries: 70 }, maxAbi: 25, ratings: { "Pré-flop": 8, "Pós-flop": 7, ICM: 7, "Push/Fold": 9, "Blind War": 7, "Mental Game": 8, Organização: 9, Disciplina: 9, Comunicação: 8, Volume: 7, Comprometimento: 9 } },
    p2: { nick: "BrunoGrind", status: "Atenção", goals: { entries: 90 }, maxAbi: 12, ratings: { "Pré-flop": 6, "Pós-flop": 5, ICM: 5, "Push/Fold": 7, "Blind War": 5, "Mental Game": 5, Organização: 7, Disciplina: 6, Comunicação: 7, Volume: 9, Comprometimento: 7 } },
    p3: { nick: "CarlaMTT", status: "Ativo", goals: { entries: 60 }, maxAbi: 35, ratings: { "Pré-flop": 9, "Pós-flop": 8, ICM: 8, "Push/Fold": 8, "Blind War": 8, "Mental Game": 7, Organização: 8, Disciplina: 8, Comunicação: 6, Volume: 7, Comprometimento: 8 } },
    p4: { nick: "DiegoRk", status: "Crítico", goals: { entries: 80 }, maxAbi: 5.5, ratings: { "Pré-flop": 4, "Pós-flop": 4, ICM: 3, "Push/Fold": 5, "Blind War": 4, "Mental Game": 5, Organização: 5, Disciplina: 4, Comunicação: 6, Volume: 6, Comprometimento: 6 } },
  };
  const meetings = [
    { id: "m1", playerId: "p1", date: "2026-11-10", topic: "Review de FT e ICM", nextSteps: "Estudar bolha com stack médio" },
    { id: "m2", playerId: "p2", date: "2026-10-20", topic: "Downswing e makeup", nextSteps: "Reduzir ABI até sair do makeup" },
    { id: "m3", playerId: "p3", date: "2026-11-14", topic: "Grade da semana", nextSteps: "Adicionar 2 torneios de $33" },
    { id: "m4", playerId: "p4", date: "2026-11-03", topic: "Push/fold até 15bb", nextSteps: "Rodar Leak Finder e trazer os erros" },
  ];
  return {
    players: players.map(({ abi, edge, ...p }) => ({ ...p, ...extra[p.id] })),
    sessions,
    settlements: [],
    meetings,
  };
}
