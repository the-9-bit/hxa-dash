const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/timeline — event timeline
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const events = db.getTimeline(limit);
  res.json({ events });
});

module.exports = router;
