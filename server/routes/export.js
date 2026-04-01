const express = require('express');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const router = express.Router();

router.get('/export/:id/csv', async (req, res) => {
  const { id } = req.params;

  try {
    const [job] = await pool.execute(
      'SELECT * FROM scrape_jobs WHERE id = ?',
      [id]
    );

    if (!job.length) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const [results] = await pool.execute(
      'SELECT result_text FROM scrape_results WHERE job_id = ?',
      [id]
    );

    const parsed = results.map(r => {
      try { return JSON.parse(r.result_text); }
      catch { return { text: r.result_text }; }
    });

    if (!parsed.length) {
      return res.status(404).json({ success: false, error: 'No results to export' });
    }

    const fields = Object.keys(parsed[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(parsed);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="scrape-job-${id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export/:id/pdf', async (req, res) => {
  const { id } = req.params;

  try {
    const [job] = await pool.execute(
      'SELECT * FROM scrape_jobs WHERE id = ?',
      [id]
    );

    if (!job.length) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const [results] = await pool.execute(
      'SELECT result_text FROM scrape_results WHERE job_id = ?',
      [id]
    );

    const parsed = results.map(r => {
      try { return JSON.parse(r.result_text); }
      catch { return { text: r.result_text }; }
    });

    if (!parsed.length) {
      return res.status(404).json({ success: false, error: 'No results to export' });
    }

    const doc = new PDFDocument({ margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="scrape-job-${id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).text(`Scrape Job #${id}`, { align: 'center' });
    doc.fontSize(10).text(`URL: ${job[0].url}`, { align: 'center' });
    doc.fontSize(10).text(`Selector: ${job[0].selector}`, { align: 'center' });
    doc.fontSize(10).text(`Date: ${new Date(job[0].created_at).toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    const fields = Object.keys(parsed[0]);
    doc.fontSize(11).text(`Total Results: ${parsed.length}`, { underline: true });
    doc.moveDown();

    const tableTop = doc.y;
    const cellPadding = 5;
    const colWidth = (doc.page.width - 60) / Math.max(fields.length, 1);

    doc.fontSize(9).font('Helvetica-Bold');
    fields.forEach((field, i) => {
      doc.text(
        field.substring(0, 20),
        30 + i * colWidth,
        tableTop,
        { width: colWidth - cellPadding, align: 'left' }
      );
    });

    doc.moveTo(30, tableTop + 12, doc.page.width - 30, tableTop + 12).stroke();
    doc.font('Helvetica');

    let yPos = tableTop + 20;
    parsed.slice(0, 50).forEach((row, rowIndex) => {
      if (yPos > doc.page.height - 60) {
        doc.addPage();
        yPos = 30;
      }

      fields.forEach((field, i) => {
        const val = String(row[field] || '').substring(0, 30);
        doc.text(
          val,
          30 + i * colWidth,
          yPos,
          { width: colWidth - cellPadding, align: 'left' }
        );
      });
      yPos += 14;
    });

    if (parsed.length > 50) {
      doc.moveDown();
      doc.text(`... and ${parsed.length - 50} more results`, { align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
