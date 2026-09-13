# Catdoku

An ad-free web clone of the "one cat per colour" puzzle (a Star Battle / Queens variant).

## Rules

Place exactly one cat in every **colour region**, every **row** and every **column**.
Cats cannot touch each other, not even diagonally. Tap a cell to mark it ✕, tap again
to place a cat, tap once more to clear it. A wrong cat costs a fish; lose all three and
you get a fresh puzzle for that level.

- 💡 **Hint** (1 per level) marks cells that can be ruled out.
- 🐱 **Reveal** (2 per level) places a correct cat.
- Level score = `10 × grid size × fish remaining / 3`.

Players (with optional name and colour) and scores are stored in the browser's
localStorage. Grid size grows with level, with some jitter to vary difficulty.

## Running

No build step. Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Tests

```sh
node --test tests/*.test.js
```
