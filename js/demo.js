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
  return {
    players: players.map(({ abi, edge, ...p }) => p),
    sessions,
    settlements: [],
  };
}
