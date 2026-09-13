const test = require('node:test');
const assert = require('node:assert');
const Rng = require('../js/rng.js');
const Gen = require('../js/generator.js');
const { Game, EMPTY, MARK, CAT, LIVES } = require('../js/game.js');

test('generated puzzles are unique and valid for every size', () => {
  for (let n = Gen.MIN_SIZE; n <= Gen.MAX_SIZE; n++) {
    for (let k = 0; k < 5; k++) {
      const rng = Rng.mulberry32(n * 100 + k);
      const p = Gen.generate(n, rng, 0.2 + 0.7 * (k / 5));
      assert.ok(p, `generate failed for n=${n}`);
      assert.strictEqual(Gen.countSolutions(n, p.regions, 3), 1);
      assert.ok(Gen.isValidSolution(n, p.regions, p.solution));
      assert.deepStrictEqual(Gen.solve(n, p.regions), p.solution);
      // Every region is non-empty and every cell claimed.
      const seen = new Set(p.regions);
      assert.strictEqual(seen.size, n);
      assert.ok(!seen.has(-1));
    }
  }
});

test('puzzles are deterministic per (level, attempt)', () => {
  const a = Gen.puzzleForLevel(7, 0), b = Gen.puzzleForLevel(7, 0), c = Gen.puzzleForLevel(7, 1);
  assert.deepStrictEqual(a.regions, b.regions);
  assert.deepStrictEqual(a.solution, b.solution);
  assert.notDeepStrictEqual(a.regions, c.regions);
});

test('sizeForLevel stays in range and trends upward', () => {
  const avg = (lo, hi) => {
    let s = 0;
    for (let l = lo; l <= hi; l++) s += Gen.sizeForLevel(l, Rng.mulberry32(l));
    return s / (hi - lo + 1);
  };
  for (let l = 1; l <= 200; l++) {
    const n = Gen.sizeForLevel(l, Rng.mulberry32(l));
    assert.ok(n >= Gen.MIN_SIZE && n <= Gen.MAX_SIZE);
  }
  assert.ok(avg(1, 5) < avg(11, 15));
  assert.ok(avg(11, 15) < avg(40, 60));
});

test('game: wrong cat loses a life, three wrongs fail the level', () => {
  const g = new Game(Gen.puzzleForLevel(1, 0));
  const wrong = g.cells.findIndex((_, i) => !g.isCatCell(i));
  assert.strictEqual(g.tap(wrong).type, 'mark');
  const ev = g.tap(wrong);
  assert.strictEqual(ev.type, 'wrong');
  assert.strictEqual(g.lives, LIVES - 1);
  assert.strictEqual(g.cells[wrong], MARK);
  g.placeCat(wrong); g.placeCat(wrong);
  assert.strictEqual(g.status, 'failed');
  assert.strictEqual(g.tap(wrong).type, 'ignored');
});

test('game: placing all cats wins with a lives-based score', () => {
  const p = Gen.puzzleForLevel(3, 0);
  const g = new Game(p);
  const wrong = g.cells.findIndex((_, i) => !g.isCatCell(i));
  g.placeCat(wrong); // one life lost
  let last;
  for (let r = 0; r < p.n; r++) last = g.placeCat(r * p.n + p.solution[r], true);
  assert.strictEqual(g.status, 'won');
  assert.strictEqual(last.score, Math.round(10 * p.n * 2 / 3));
  // Auto-mark left no EMPTY cells other than cats.
  assert.ok(g.cells.every((c) => c !== EMPTY));
});

test('game: hint and reveal are limited and never mark a cat cell', () => {
  const g = new Game(Gen.puzzleForLevel(10, 0));
  const h = g.useHint();
  assert.ok(h.marked.length > 0);
  assert.ok(h.marked.every((i) => !g.isCatCell(i)));
  assert.strictEqual(g.useHint(), null);
  const r1 = g.useReveal(), r2 = g.useReveal();
  assert.strictEqual(r1.type, 'reveal');
  assert.strictEqual(r2.type, 'reveal');
  assert.strictEqual(g.useReveal(), null);
  assert.strictEqual(g.catCount(), 2);
  assert.strictEqual(g.lives, LIVES);
});

test('game: state round-trips through toJSON', () => {
  const p = Gen.puzzleForLevel(2, 0);
  const g = new Game(p);
  g.tap(0); g.useHint();
  const g2 = new Game(p, JSON.parse(JSON.stringify(g)));
  assert.deepStrictEqual(g2.cells, g.cells);
  assert.strictEqual(g2.hintsLeft, 0);
});
