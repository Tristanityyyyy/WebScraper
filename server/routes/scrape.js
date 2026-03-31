const express = require('express');
const pool = require('../db');
const router = express.Router();

router.post('/scrape', async (req, res) => {
  const { url, selector, results } = req.body;

  if (!url || !selector || !results) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }

  try {
    const [job] = await pool.execute(
      'INSERT INTO scrape_jobs (url, selector, result_count) VALUES (?, ?, ?)',
      [url, selector, results.length]
    );

    const jobId = job.insertId;

    // Store each result as JSON so all fields are preserved
    if (results.length > 0) {
      const placeholders = results.map(() => '(?, ?)').join(', ');
      const values = results.flatMap(row => [
        jobId,
        typeof row === 'object' ? JSON.stringify(row) : row
      ]);
      await pool.execute(
        `INSERT INTO scrape_results (job_id, result_text) VALUES ${placeholders}`,
        values
      );
    }

    res.json({ success: true, jobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/jobs — view all saved jobs
router.get('/jobs', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM scrape_jobs ORDER BY created_at DESC LIMIT 50'
  );
  res.json(rows);
});

// GET /api/jobs/:id — view results of a specific job
router.get('/jobs/:id', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM scrape_results WHERE job_id = ?',
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;