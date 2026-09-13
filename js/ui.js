// Rendering and event wiring. Talks to CatGen / CatGame / CatStore.
(function (root) {
  'use strict';

  var Gen = root.CatGen, G = root.CatGame, Store = root.CatStore;

  var data, game, puzzle, timerId = null;
  var $ = function (id) { return document.getElementById(id); };

  var MINI = {
    region: ['x', 'x', 'x', 'x', 'cat', '.', 'x', '.', '.'],
    rowcol: ['x', 'cat', 'x', '.', 'x', '.', '.', 'x', '.'],
    touch:  ['x', 'x', 'x', 'x', 'cat', 'x', 'x', 'x', 'x']
  };

  // ---------- helpers ----------

  function player() { return data.activePlayerId ? data.players[data.activePlayerId] : null; }

  function showScreen(name) {
    ['game', 'home', 'settings'].forEach(function (s) { $('screen-' + s).hidden = s !== name; });
    if (name === 'game') startTimer(); else stopTimer();
    window.scrollTo(0, 0);
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function confirm(title, text, onYes) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('overlay-confirm').hidden = false;
    $('btn-confirm-yes').onclick = function () { $('overlay-confirm').hidden = true; onYes(); };
    $('btn-confirm-no').onclick = function () { $('overlay-confirm').hidden = true; };
  }

  function renderSwatches(container, selected, onPick) {
    container.innerHTML = '';
    Store.PLAYER_COLOURS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === selected ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'Colour ' + c);
      b.onclick = function () {
        container.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('on'); });
        b.classList.add('on');
        onPick(c);
      };
      container.appendChild(b);
    });
  }

  function renderMinis() {
    document.querySelectorAll('.mini').forEach(function (el) {
      var pattern = MINI[el.dataset.mini];
      el.innerHTML = '';
      pattern.forEach(function (p) {
        var i = document.createElement('i');
        if (p === 'x') { i.className = 'x'; i.textContent = '✕'; }
        else if (p === 'cat') { i.className = 'cat'; i.textContent = '🐱'; }
        el.appendChild(i);
      });
    });
  }

  // ---------- timer ----------

  function startTimer() {
    stopTimer();
    if (!game || game.status !== 'playing') return;
    var last = Date.now();
    timerId = setInterval(function () {
      var now = Date.now();
      if (game.status === 'playing' && !document.hidden) game.elapsed += now - last;
      last = now;
      $('timer').textContent = formatTime(game.elapsed);
    }, 1000);
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  // ---------- game ----------

  function startLevel() {
    var p = player();
    puzzle = Gen.puzzleForLevel(p.level, p.attempt);
    var saved = data.inProgress[p.id];
    if (saved && (saved.level !== p.level || saved.attempt !== p.attempt || saved.status !== 'playing')) saved = null;
    game = new G.Game(puzzle, saved);
    buildBoard();
    renderGame();
    saveProgress();
    startTimer();
  }

  function saveProgress() {
    var p = player();
    if (game.status === 'playing') data.inProgress[p.id] = game.toJSON();
    else delete data.inProgress[p.id];
    Store.save(data);
  }

  function buildBoard() {
    var board = $('board'), n = puzzle.n;
    board.innerHTML = '';
    board.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
    for (var i = 0; i < n * n; i++) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.idx = i;
      cell.style.background = Gen.PALETTE[puzzle.regions[i]];
      cell.setAttribute('aria-label', 'Row ' + (Math.floor(i / n) + 1) + ' column ' + (i % n + 1));
      board.appendChild(cell);
    }
    var bar = $('cat-bar');
    bar.innerHTML = '';
    for (var k = 0; k < n; k++) {
      var slot = document.createElement('span');
      slot.className = 'slot';
      slot.textContent = '🐱';
      bar.appendChild(slot);
    }
    var fish = $('fish-bar');
    fish.innerHTML = '';
    for (var f = 0; f < G.LIVES; f++) {
      var fs = document.createElement('span');
      fs.className = 'fish';
      fs.textContent = '🐟';
      fish.appendChild(fs);
    }
  }

  function renderGame() {
    var p = player();
    $('stat-level').textContent = p.level;
    $('stat-score').textContent = p.totalScore;
    var cells = $('board').children;
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('mark', game.cells[i] === G.MARK);
      cells[i].classList.toggle('cat', game.cells[i] === G.CAT);
    }
    var placed = game.catCount();
    var slots = $('cat-bar').children;
    for (var s = 0; s < slots.length; s++) slots[s].classList.toggle('on', s < placed);
    var fish = $('fish-bar').children;
    for (var f = 0; f < fish.length; f++) fish[f].classList.toggle('lost', f >= game.lives);
    $('hint-count').textContent = game.hintsLeft;
    $('reveal-count').textContent = game.revealsLeft;
    $('btn-hint').disabled = game.hintsLeft <= 0 || game.status !== 'playing';
    $('btn-reveal').disabled = game.revealsLeft <= 0 || game.status !== 'playing';
    $('timer').textContent = formatTime(game.elapsed);
  }

  function pop(indices) {
    indices.forEach(function (i) {
      var el = $('board').children[i];
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    });
  }

  function handleEvent(ev) {
    if (!ev || ev.type === 'ignored') return;
    renderGame();
    if (ev.type === 'wrong') {
      var el = $('board').children[ev.idx];
      el.classList.add('shake');
      setTimeout(function () { el.classList.remove('shake'); }, 400);
      if (ev.failed) setTimeout(function () { $('overlay-failed').hidden = false; }, 450);
    } else if (ev.type === 'cat' || ev.type === 'reveal') {
      pop([ev.idx].concat(ev.marked || []));
      if (ev.won) onWon(ev.score);
    } else if (ev.type === 'hint') {
      pop(ev.marked);
    }
    saveProgress();
  }

  function onWon(score) {
    var p = player();
    stopTimer();
    p.totalScore += score;
    p.levelsDone += 1;
    var best = p.bestByLevel[p.level] || 0;
    if (score > best) p.bestByLevel[p.level] = score;
    p.level += 1;
    p.attempt = 0;
    $('stat-score').textContent = p.totalScore;
    var lost = G.LIVES - game.lives;
    $('won-detail').textContent = puzzle.n + '×' + puzzle.n + ' in ' + formatTime(game.elapsed) +
      (lost ? ' · ' + lost + ' fish lost' : ' · no fish lost!');
    $('won-points').textContent = score;
    setTimeout(function () { $('overlay-won').hidden = false; }, 350);
    saveProgress();
  }

  function onTap(e) {
    var cell = e.target.closest('.cell');
    if (!cell || !game) return;
    handleEvent(game.tap(Number(cell.dataset.idx), data.settings.autoMark));
  }

  // ---------- home ----------

  var newColour = Store.PLAYER_COLOURS[0];

  function renderHome() {
    var tbody = $('scoreboard').querySelector('tbody');
    tbody.innerHTML = '';
    var rows = Store.ranking(data);
    $('scoreboard').hidden = rows.length === 0;
    $('no-players').hidden = rows.length > 0;
    rows.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.className = 'row' + (p.id === data.activePlayerId ? ' active' : '');
      tr.innerHTML = '<td><span class="dot" style="background:' + p.colour + '"></span></td>' +
        '<td></td><td class="num">' + p.level + '</td><td class="num">' + p.totalScore + '</td>';
      tr.children[1].textContent = p.name;
      if (p.id === data.activePlayerId) {
        var you = document.createElement('span');
        you.className = 'you'; you.textContent = 'playing';
        tr.children[1].appendChild(you);
      }
      tr.onclick = function () {
        data.activePlayerId = p.id;
        Store.save(data);
        startLevel();
        showScreen('game');
      };
      tbody.appendChild(tr);
    });
    $('btn-play').hidden = !player();
    if (player()) $('btn-play').textContent = 'Play as ' + player().name;
    var count = rows.length;
    newColour = Store.PLAYER_COLOURS[count % Store.PLAYER_COLOURS.length];
    renderSwatches($('new-colours'), newColour, function (c) { newColour = c; });
    $('new-name').value = '';
  }

  function addPlayer() {
    Store.newPlayer(data, $('new-name').value, newColour);
    Store.save(data);
    startLevel();
    showScreen('game');
  }

  // ---------- settings ----------

  function renderSettings() {
    var p = player();
    $('edit-name').value = p.name;
    renderSwatches($('edit-colours'), p.colour, function (c) { p.colour = c; Store.save(data); });
    $('opt-automark').checked = !!data.settings.autoMark;
  }

  // ---------- boot ----------

  function init() {
    data = Store.load();
    renderMinis();

    $('board').addEventListener('click', onTap);
    $('btn-hint').onclick = function () { handleEvent(game.useHint()); };
    $('btn-reveal').onclick = function () { handleEvent(game.useReveal()); };
    $('btn-home').onclick = function () { saveProgress(); renderHome(); showScreen('home'); };
    $('btn-settings').onclick = function () { saveProgress(); renderSettings(); showScreen('settings'); };
    $('btn-settings-back').onclick = function () { renderGame(); showScreen('game'); };
    $('btn-play').onclick = function () { startLevel(); showScreen('game'); };
    $('btn-add-player').onclick = addPlayer;
    $('new-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPlayer(); });

    $('btn-next').onclick = function () { $('overlay-won').hidden = true; startLevel(); };
    $('btn-retry').onclick = function () {
      $('overlay-failed').hidden = true;
      player().attempt += 1;
      delete data.inProgress[player().id];
      Store.save(data);
      startLevel();
    };

    $('edit-name').addEventListener('input', function () {
      player().name = $('edit-name').value.trim() || player().name;
      Store.save(data);
    });
    $('opt-automark').addEventListener('change', function () {
      data.settings.autoMark = $('opt-automark').checked;
      Store.save(data);
    });
    $('btn-reset-player').onclick = function () {
      confirm('Reset progress?', 'This sets ' + player().name + ' back to level 1 with a score of 0.', function () {
        Store.resetPlayer(data, player().id);
        Store.save(data);
        startLevel();
        showScreen('game');
      });
    };
    $('btn-delete-player').onclick = function () {
      confirm('Delete player?', 'This removes ' + player().name + ' and their scores.', function () {
        Store.deletePlayer(data, player().id);
        Store.save(data);
        renderHome();
        showScreen('home');
      });
    };

    window.addEventListener('pagehide', function () { if (game) saveProgress(); });

    if (player()) { startLevel(); showScreen('game'); }
    else { renderHome(); showScreen('home'); }
  }

  root.CatUI = { init: init };
})(window);
