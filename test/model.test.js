import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, settle, sessionProfit, openSessions, cumulative } from "../js/model.js";

test("sessionProfit = prêmios - buy-ins", () => {
  assert.equal(sessionProfit({ buyins: 550, cashes: 1210.5 }), 660.5);
});

test("stats calcula ROI, ABI e ITM", () => {
  const s = stats([
    { buyins: 1000, cashes: 1500, entries: 20, itm: 4 },
    { buyins: 1000, cashes: 300, entries: 20, itm: 2 },
  ]);
  assert.equal(s.profit, -200);
  assert.equal(s.roi, -0.1);
  assert.equal(s.abi, 50);
  assert.equal(s.itmRate, 0.15);
});

test("stats sem sessões não divide por zero", () => {
  const s = stats([]);
  assert.equal(s.roi, 0);
  assert.equal(s.abi, 0);
});

test("lucro abaixo do makeup só reduz o makeup", () => {
  assert.deepEqual(settle({ makeup: -3000, profit: 1000, playerShare: 0.5 }), {
    net: -2000, toPlayer: 0, toBacker: 0, makeupAfter: -2000,
  });
});

test("lucro acima do makeup zera o makeup e divide o resto", () => {
  assert.deepEqual(settle({ makeup: -3000, profit: 5000, playerShare: 0.4 }), {
    net: 2000, toPlayer: 800, toBacker: 1200, makeupAfter: 0,
  });
});

test("prejuízo aumenta o makeup", () => {
  assert.equal(settle({ makeup: -500, profit: -700, playerShare: 0.5 }).makeupAfter, -1200);
});

test("valida entradas do acerto", () => {
  assert.throws(() => settle({ makeup: 100, profit: 0, playerShare: 0.5 }));
  assert.throws(() => settle({ makeup: 0, profit: 0, playerShare: 1.5 }));
});

test("openSessions ignora sessões já acertadas e de outros jogadores", () => {
  const list = [
    { playerId: "a" }, { playerId: "a", settlementId: "x" }, { playerId: "b" },
  ];
  assert.equal(openSessions(list, "a").length, 1);
});

test("cumulative ordena por data e acumula", () => {
  const c = cumulative([
    { date: "2026-02-01", buyins: 100, cashes: 0 },
    { date: "2026-01-01", buyins: 100, cashes: 300 },
  ]);
  assert.deepEqual(c.map((p) => p.value), [200, 100]);
});
