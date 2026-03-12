const { Router } = require('express');
const db = require('../db');

const router = Router();

function safeJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}

// Build board payload with parsed labels — shared between REST and WS broadcasts
function buildBoard() {
  const board = db.getTasksByState();
  const result = {};
  for (const col of ['todo', 'doing', 'done']) {
    result[col] = board[col].map(t => ({ ...t, labels: safeJSON(t.labels) }));
  }
  return result;
}

// GET /api/board — task board (todo/doing/done)
router.get('/', (req, res) => {
  res.json(buildBoard());
});

module.exports = router;
module.exports.buildBoard = buildBoard;
