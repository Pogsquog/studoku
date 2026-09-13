// localStorage persistence: players, scores, settings and in-progress boards.
(function (root) {
  'use strict';

  var KEY = 'studoku.v1';

  var PLAYER_COLOURS = [
    '#e5533c', '#f28c28', '#e6b400', '#5cb85c', '#2aa7b8', '#3b7dd8',
    '#7a5be6', '#d64a9e', '#c96b8c', '#8d6e63', '#607d8b', '#333333'
  ];

  function defaults() {
    return { players: {}, activePlayerId: null, settings: { autoMark: true }, inProgress: {} };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var data = JSON.parse(raw);
      var d = defaults();
      Object.keys(d).forEach(function (k) { if (data[k] === undefined) data[k] = d[k]; });
      return data;
    } catch (e) {
      return defaults();
    }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full or blocked */ }
  }

  function newPlayer(data, name, colour) {
    var id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var count = Object.keys(data.players).length + 1;
    data.players[id] = {
      id: id,
      name: (name || '').trim() || ('Player ' + count),
      colour: colour || PLAYER_COLOURS[(count - 1) % PLAYER_COLOURS.length],
      level: 1,
      attempt: 0,
      totalScore: 0,
      levelsDone: 0,
      bestByLevel: {},
      created: Date.now()
    };
    data.activePlayerId = id;
    return data.players[id];
  }

  function deletePlayer(data, id) {
    delete data.players[id];
    delete data.inProgress[id];
    if (data.activePlayerId === id) {
      var rest = Object.keys(data.players);
      data.activePlayerId = rest.length ? rest[0] : null;
    }
  }

  function resetPlayer(data, id) {
    var p = data.players[id];
    if (!p) return;
    p.level = 1; p.attempt = 0; p.totalScore = 0; p.levelsDone = 0; p.bestByLevel = {};
    delete data.inProgress[id];
  }

  function ranking(data) {
    return Object.keys(data.players).map(function (k) { return data.players[k]; })
      .sort(function (a, b) { return b.totalScore - a.totalScore || b.level - a.level || a.created - b.created; });
  }

  var api = {
    KEY: KEY, PLAYER_COLOURS: PLAYER_COLOURS,
    load: load, save: save, newPlayer: newPlayer, deletePlayer: deletePlayer,
    resetPlayer: resetPlayer, ranking: ranking
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
