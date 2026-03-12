const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/board — task board (todo/doing/done)
router.get('/', (req, res) => {
  const board = db.getTasksByState();

  // Group by project
  const grouped = {};
  for (const col of ['todo', 'doing', 'done']) {
    grouped[col] = board[col].map(t => ({
      ...t,
      labels: safeJSON(t.labels)
    }));
  }

  res.json(grouped);
});

function safeJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}

module.exports = router;
