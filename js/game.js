// Per-level game state and rules. Pure logic, no DOM.
(function (root) {
  'use strict';

  var Gen = (typeof module !== 'undefined' && module.exports) ? require('./generator.js') : root.CatGen;

  var EMPTY = 0, MARK = 1, CAT = 2;
  var LIVES = 3;
  var HINTS_PER_LEVEL = 1;
  var REVEALS_PER_LEVEL = 2;

  function Game(puzzle, saved) {
    this.puzzle = puzzle;
    this.n = puzzle.n;
    this.cells = saved ? saved.cells.slice() : new Array(this.n * this.n).fill(EMPTY);
    this.lives = saved ? saved.lives : LIVES;
    this.hintsLeft = saved ? saved.hintsLeft : HINTS_PER_LEVEL;
    this.revealsLeft = saved ? saved.revealsLeft : REVEALS_PER_LEVEL;
    this.elapsed = saved ? saved.elapsed : 0; // ms, maintained by the UI
    this.status = saved ? saved.status : 'playing'; // playing | won | failed
  }

  Game.prototype.toJSON = function () {
    return {
      level: this.puzzle.level, attempt: this.puzzle.attempt,
      cells: this.cells, lives: this.lives, hintsLeft: this.hintsLeft,
      revealsLeft: this.revealsLeft, elapsed: this.elapsed, status: this.status
    };
  };

  Game.prototype.isCatCell = function (idx) {
    var n = this.n;
    return this.puzzle.solution[Math.floor(idx / n)] === idx % n;
  };

  Game.prototype.catCount = function () {
    return this.cells.filter(function (c) { return c === CAT; }).length;
  };

  // Score for the level given the lives remaining at the end.
  Game.prototype.scoreForLives = function (lives) {
    return Math.round(10 * this.n * lives / LIVES);
  };

  // Every cell ruled out by a cat at idx: its row, column, region and 8 neighbours.
  Game.prototype.eliminatedBy = function (idx) {
    var n = this.n, regions = this.puzzle.regions, out = {};
    var r = Math.floor(idx / n), c = idx % n, reg = regions[idx];
    for (var i = 0; i < n * n; i++) {
      if (i === idx) continue;
      if (Math.floor(i / n) === r || i % n === c || regions[i] === reg) out[i] = true;
    }
    Gen.allNeighbours(idx, n).forEach(function (m) { out[m] = true; });
    return Object.keys(out).map(Number);
  };

  Game.prototype.markAround = function (idx) {
    var changed = [];
    var self = this;
    this.eliminatedBy(idx).forEach(function (m) {
      if (self.cells[m] === EMPTY) { self.cells[m] = MARK; changed.push(m); }
    });
    return changed;
  };

  // Tap cycles EMPTY -> MARK -> CAT -> EMPTY. Returns an event describing what happened.
  Game.prototype.tap = function (idx, autoMark) {
    if (this.status !== 'playing') return { type: 'ignored' };
    var cur = this.cells[idx];
    if (cur === EMPTY) {
      this.cells[idx] = MARK;
      return { type: 'mark', idx: idx };
    }
    if (cur === MARK) return this.placeCat(idx, autoMark);
    this.cells[idx] = EMPTY;
    return { type: 'clear', idx: idx };
  };

  // Long-press / right-click: clear a cell directly without cycling through CAT.
  Game.prototype.clear = function (idx) {
    if (this.status !== 'playing' || this.cells[idx] === EMPTY) return { type: 'ignored' };
    this.cells[idx] = EMPTY;
    return { type: 'clear', idx: idx };
  };

  Game.prototype.placeCat = function (idx, autoMark) {
    if (!this.isCatCell(idx)) {
      this.cells[idx] = MARK;
      this.lives--;
      if (this.lives <= 0) { this.lives = 0; this.status = 'failed'; }
      return { type: 'wrong', idx: idx, lives: this.lives, failed: this.status === 'failed' };
    }
    this.cells[idx] = CAT;
    var marked = autoMark ? this.markAround(idx) : [];
    var ev = { type: 'cat', idx: idx, marked: marked };
    if (this.catCount() === this.n) {
      this.status = 'won';
      ev.won = true;
      ev.score = this.scoreForLives(this.lives);
    }
    return ev;
  };

  // Hint: mark everything the placed cats already rule out; if nothing new,
  // rule out a few non-cat cells in the region with the fewest empty cells.
  Game.prototype.useHint = function () {
    if (this.status !== 'playing' || this.hintsLeft <= 0) return null;
    var self = this, marked = [];
    this.cells.forEach(function (v, i) { if (v === CAT) marked = marked.concat(self.markAround(i)); });
    if (!marked.length) {
      // Rule out non-cat empty cells, starting with the regions that are
      // closest to being solved (fewest empty cells, no cat yet).
      var n = this.n, regions = this.puzzle.regions;
      var regionHasCat = {};
      this.cells.forEach(function (v, i) { if (v === CAT) regionHasCat[regions[i]] = true; });
      var candidates = [];
      this.cells.forEach(function (v, i) {
        if (v === EMPTY && !self.isCatCell(i) && !regionHasCat[regions[i]]) candidates.push(i);
      });
      var emptyCount = {};
      candidates.forEach(function (i) { emptyCount[regions[i]] = self.emptyInRegion(regions[i]); });
      candidates.sort(function (a, b) { return emptyCount[regions[a]] - emptyCount[regions[b]] || a - b; });
      marked = candidates.slice(0, Math.ceil(n / 2));
      marked.forEach(function (i) { self.cells[i] = MARK; });
    }
    this.hintsLeft--;
    return { type: 'hint', marked: marked };
  };

  // Reveal: place a correct cat in a region that has none.
  Game.prototype.useReveal = function () {
    if (this.status !== 'playing' || this.revealsLeft <= 0) return null;
    var n = this.n, regions = this.puzzle.regions, self = this;
    var regionHasCat = {};
    this.cells.forEach(function (v, i) { if (v === CAT) regionHasCat[regions[i]] = true; });
    var candidates = [];
    for (var r = 0; r < n; r++) {
      var idx = r * n + this.puzzle.solution[r];
      if (!regionHasCat[regions[idx]]) candidates.push(idx);
    }
    if (!candidates.length) return null;
    // Prefer the region the player has narrowed down the most.
    candidates.sort(function (a, b) {
      return self.emptyInRegion(regions[a]) - self.emptyInRegion(regions[b]);
    });
    this.revealsLeft--;
    var ev = this.placeCat(candidates[0], true);
    ev.type = 'reveal';
    return ev;
  };

  Game.prototype.emptyInRegion = function (reg) {
    var regions = this.puzzle.regions, count = 0;
    for (var i = 0; i < this.cells.length; i++) {
      if (regions[i] === reg && this.cells[i] === EMPTY) count++;
    }
    return count;
  };

  var api = {
    EMPTY: EMPTY, MARK: MARK, CAT: CAT,
    LIVES: LIVES, HINTS_PER_LEVEL: HINTS_PER_LEVEL, REVEALS_PER_LEVEL: REVEALS_PER_LEVEL,
    Game: Game
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
