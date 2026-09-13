// Puzzle generation and solving. Pure logic, no DOM.
//
// A puzzle is an n x n grid split into n colour regions. The solution places
// one cat per row, column and region with no two cats touching (including
// diagonally). Every generated puzzle has exactly one solution.
(function (root) {
  'use strict';

  var Rng = (typeof module !== 'undefined' && module.exports) ? require('./rng.js') : root.CatRng;

  var MIN_SIZE = 5;
  var MIN_REGION = 3; // preferred minimum cells per region
  var MAX_SIZE = 10;

  // Colours lifted from the screenshot, in region order.
  var PALETTE = [
    '#d4ac0d', // mustard
    '#2e9c5c', // green
    '#f6a1e7', // pink
    '#f9a35b', // orange
    '#8b82e6', // purple
    '#2aa7b8', // teal
    '#c96b8c', // dusty rose
    '#f9df7f', // yellow
    '#9edb7c', // lime
    '#4d6f9f'  // slate blue
  ];

  // --- solution placement --------------------------------------------------

  // Returns an array `cols` where cols[row] is the cat's column, or null.
  function placeSolution(n, rng) {
    var cols = new Array(n);
    var used = new Array(n).fill(false);

    function step(row) {
      if (row === n) return true;
      var order = rng.shuffle(range(n));
      for (var i = 0; i < n; i++) {
        var c = order[i];
        if (used[c]) continue;
        if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
        cols[row] = c;
        used[c] = true;
        if (step(row + 1)) return true;
        used[c] = false;
      }
      return false;
    }
    return step(0) ? cols : null;
  }

  // --- region growth -------------------------------------------------------

  // Flood-grows n regions from the cat cells until every cell is claimed.
  // `irregularity` in [0,1]: 0 grows blobby regions, 1 grows snaky ones.
  function growRegions(n, solution, rng, irregularity) {
    var regions = new Array(n * n).fill(-1);
    var cells = [];   // cells[r] = list of cell indices in region r (in add order)
    var active = [];
    for (var r = 0; r < n; r++) {
      var idx = r * n + solution[r];
      regions[idx] = r;
      cells.push([idx]);
      active.push(r);
    }

    var remaining = n * n - n;
    while (remaining > 0 && active.length > 0) {
      var ai = rng.int(active.length);
      var reg = active[ai];
      var list = cells[reg];
      var grown = false;

      // Prefer the newest cell when snaky, otherwise any cell.
      var start = rng() < irregularity ? list.length - 1 : rng.int(list.length);
      for (var k = 0; k < list.length && !grown; k++) {
        var cell = list[(start + k) % list.length];
        var free = orthoNeighbours(cell, n).filter(function (m) { return regions[m] === -1; });
        if (free.length) {
          var pickIdx = rng.pick(free);
          regions[pickIdx] = reg;
          list.push(pickIdx);
          remaining--;
          grown = true;
        }
      }
      if (!grown) active.splice(ai, 1);
    }
    if (remaining > 0) return null; // can't happen with connected growth, but be safe
    return regions;
  }

  // --- solver --------------------------------------------------------------

  // Counts solutions up to `limit`. `regions` is a flat n*n array.
  function countSolutions(n, regions, limit) {
    limit = limit || 2;
    var colUsed = new Array(n).fill(false);
    var regUsed = new Array(n).fill(false);
    var count = 0;

    function step(row, prevCol) {
      if (row === n) { count++; return count >= limit; }
      for (var c = 0; c < n; c++) {
        if (colUsed[c]) continue;
        if (row > 0 && Math.abs(prevCol - c) <= 1) continue;
        var reg = regions[row * n + c];
        if (regUsed[reg]) continue;
        colUsed[c] = true; regUsed[reg] = true;
        var done = step(row + 1, c);
        colUsed[c] = false; regUsed[reg] = false;
        if (done) return true;
      }
      return false;
    }
    step(0, -1);
    return count;
  }

  function solve(n, regions) {
    var colUsed = new Array(n).fill(false);
    var regUsed = new Array(n).fill(false);
    var cols = new Array(n);
    function step(row, prevCol) {
      if (row === n) return true;
      for (var c = 0; c < n; c++) {
        if (colUsed[c]) continue;
        if (row > 0 && Math.abs(prevCol - c) <= 1) continue;
        var reg = regions[row * n + c];
        if (regUsed[reg]) continue;
        colUsed[c] = true; regUsed[reg] = true; cols[row] = c;
        if (step(row + 1, c)) return true;
        colUsed[c] = false; regUsed[reg] = false;
      }
      return false;
    }
    return step(0, -1) ? cols : null;
  }

  // --- generation ----------------------------------------------------------

  // Finds up to `limit` solutions, returned as arrays of cols[row].
  function findSolutions(n, regions, limit) {
    var colUsed = new Array(n).fill(false);
    var regUsed = new Array(n).fill(false);
    var cols = new Array(n);
    var out = [];
    function step(row, prevCol) {
      if (row === n) { out.push(cols.slice()); return out.length >= limit; }
      for (var c = 0; c < n; c++) {
        if (colUsed[c]) continue;
        if (row > 0 && Math.abs(prevCol - c) <= 1) continue;
        var reg = regions[row * n + c];
        if (regUsed[reg]) continue;
        colUsed[c] = true; regUsed[reg] = true; cols[row] = c;
        var done = step(row + 1, c);
        colUsed[c] = false; regUsed[reg] = false;
        if (done) return true;
      }
      return false;
    }
    step(0, -1);
    return out;
  }

  // Moves `cell` from its region into region `to`. Any part of the old
  // region cut off from its cat cell `anchor` goes to `to` as well, so both
  // regions stay connected.
  function moveCell(n, regions, cell, to, anchor) {
    var from = regions[cell];
    regions[cell] = to;
    var seen = {}; seen[anchor] = true;
    var stack = [anchor];
    while (stack.length) {
      var cur = stack.pop();
      var nb = orthoNeighbours(cur, n);
      for (var k = 0; k < nb.length; k++) {
        var m = nb[k];
        if (regions[m] === from && !seen[m]) { seen[m] = true; stack.push(m); }
      }
    }
    for (var i = 0; i < regions.length; i++) {
      if (regions[i] === from && !seen[i]) regions[i] = to;
    }
  }

  // True if region `reg` stays connected without `removed`.
  function staysConnected(n, regions, reg, removed) {
    var start = -1, total = 0;
    for (var i = 0; i < regions.length; i++) {
      if (regions[i] === reg && i !== removed) { total++; if (start < 0) start = i; }
    }
    if (total === 0) return false;
    var seen = {}; seen[start] = true;
    var stack = [start], count = 0;
    while (stack.length) {
      var cur = stack.pop(); count++;
      var nb = orthoNeighbours(cur, n);
      for (var k = 0; k < nb.length; k++) {
        var m = nb[k];
        if (m !== removed && regions[m] === reg && !seen[m]) { seen[m] = true; stack.push(m); }
      }
    }
    return count === total;
  }

  // Grows regions smaller than MIN_REGION by taking neighbouring cells from
  // larger regions (never a cat cell, never disconnecting the donor).
  // Returns true if anything changed.
  function regrowTiny(n, regions, solution, rng) {
    var changed = false;
    var catCells = {};
    for (var r = 0; r < n; r++) catCells[r * n + solution[r]] = true;
    for (var reg = 0; reg < n; reg++) {
      var guard = 0;
      while (regionSize(regions, reg) < MIN_REGION && guard++ < 10) {
        var options = [];
        for (var i = 0; i < regions.length; i++) {
          if (regions[i] !== reg) continue;
          var nb = orthoNeighbours(i, n);
          for (var k = 0; k < nb.length; k++) {
            var m = nb[k], other = regions[m];
            if (other === reg || catCells[m]) continue;
            if (regionSize(regions, other) <= MIN_REGION + 1) continue;
            if (!staysConnected(n, regions, other, m)) continue;
            options.push(m);
          }
        }
        if (!options.length) break;
        regions[rng.pick(options)] = reg;
        changed = true;
      }
    }
    return changed;
  }

  function regionSize(regions, reg) {
    var c = 0;
    for (var i = 0; i < regions.length; i++) if (regions[i] === reg) c++;
    return c;
  }

  function catCellOfRegion(n, regions, solution, reg) {
    for (var r = 0; r < n; r++) {
      if (regions[r * n + solution[r]] === reg) return r * n + solution[r];
    }
    return -1;
  }

  // Random regions almost never yield a unique puzzle for n >= 6, so after
  // growing them we repair: find an alternative solution and move one of its
  // cat cells into a neighbouring region. That region then holds two of the
  // alternative's cats, killing it, while the intended solution (one cat per
  // row, and never that cell) stays valid. Repeat until unique.
  function makeUnique(n, regions, solution, rng, maxSteps) {
    maxSteps = maxSteps || 200;
    var regrows = 0;
    for (var s = 0; s < maxSteps; s++) {
      var sols = findSolutions(n, regions, 2);
      if (sols.length === 1) {
        // Let any region the repairs shrank grab cells back, then re-check.
        if (regrows++ >= 3 || !regrowTiny(n, regions, solution, rng)) return regions;
        continue;
      }
      var alt = sols[0].join() === solution.join() ? sols[1] : sols[0];
      var rows = rng.shuffle(range(n)).filter(function (r) { return alt[r] !== solution[r]; });
      // Try every (row, neighbour) move. Pick randomly among those that keep
      // the donor region at MIN_REGION cells or more (random choice avoids
      // cycling); otherwise take the one that leaves the donor largest.
      var good = [], best = null, bestSize = -1;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var cell = row * n + alt[row];
        var from = regions[cell];
        var anchor = catCellOfRegion(n, regions, solution, from);
        var nbs = orthoNeighbours(cell, n);
        for (var k = 0; k < nbs.length; k++) {
          var to = regions[nbs[k]];
          if (to === from) continue;
          var trial = regions.slice();
          moveCell(n, trial, cell, to, anchor);
          var size = regionSize(trial, from);
          if (size >= MIN_REGION) good.push(trial);
          if (size > bestSize) { best = trial; bestSize = size; }
        }
      }
      if (good.length) best = rng.pick(good);
      var moved = best;
      if (moved) for (var m = 0; m < regions.length; m++) regions[m] = moved[m];
      if (!moved) return null;
    }
    return null;
  }

  function generate(n, rng, irregularity, maxTries) {
    maxTries = maxTries || 50;
    for (var t = 0; t < maxTries; t++) {
      var solution = placeSolution(n, rng);
      if (!solution) continue;
      var regions = growRegions(n, solution, rng, irregularity);
      if (!regions) continue;
      regions = makeUnique(n, regions, solution, rng);
      if (regions) return { n: n, regions: regions, solution: solution, tries: t + 1 };
    }
    return null;
  }

  // Grid size trends upward with level but is jittered so difficulty varies.
  function sizeForLevel(level, rng) {
    var base = Math.min(MAX_SIZE, MIN_SIZE + Math.floor((level - 1) / 5));
    var jitter = rng.pick([-1, 0, 0, 1]);
    return Math.max(MIN_SIZE, Math.min(MAX_SIZE, base + jitter));
  }

  function puzzleForLevel(level, attempt) {
    attempt = attempt || 0;
    var seed = Rng.hashSeed('catdoku', level, attempt);
    var rng = Rng.mulberry32(seed);
    var n = sizeForLevel(level, rng);
    var irregularity = 0.2 + rng() * 0.7;
    var puzzle = generate(n, rng, irregularity);
    if (!puzzle) puzzle = generate(n, rng, 0.1, 500); // practically unreachable fallback
    puzzle.level = level;
    puzzle.attempt = attempt;
    puzzle.seed = seed;
    puzzle.irregularity = irregularity;
    return puzzle;
  }

  // --- helpers -------------------------------------------------------------

  function range(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = i;
    return a;
  }

  function orthoNeighbours(idx, n) {
    var r = Math.floor(idx / n), c = idx % n, out = [];
    if (r > 0) out.push(idx - n);
    if (r < n - 1) out.push(idx + n);
    if (c > 0) out.push(idx - 1);
    if (c < n - 1) out.push(idx + 1);
    return out;
  }

  // All 8 neighbours (used for the "cats cannot touch" rule).
  function allNeighbours(idx, n) {
    var r = Math.floor(idx / n), c = idx % n, out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
      }
    }
    return out;
  }

  // Checks a full placement (cols[row]) against all four rules.
  function isValidSolution(n, regions, cols) {
    if (!cols || cols.length !== n) return false;
    var colSeen = new Array(n).fill(false), regSeen = new Array(n).fill(false);
    for (var r = 0; r < n; r++) {
      var c = cols[r];
      if (c < 0 || c >= n || colSeen[c]) return false;
      colSeen[c] = true;
      var reg = regions[r * n + c];
      if (regSeen[reg]) return false;
      regSeen[reg] = true;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) return false;
    }
    return true;
  }

  var api = {
    MIN_SIZE: MIN_SIZE,
    MAX_SIZE: MAX_SIZE,
    PALETTE: PALETTE,
    placeSolution: placeSolution,
    growRegions: growRegions,
    countSolutions: countSolutions,
    findSolutions: findSolutions,
    makeUnique: makeUnique,
    solve: solve,
    generate: generate,
    sizeForLevel: sizeForLevel,
    puzzleForLevel: puzzleForLevel,
    orthoNeighbours: orthoNeighbours,
    allNeighbours: allNeighbours,
    isValidSolution: isValidSolution
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
