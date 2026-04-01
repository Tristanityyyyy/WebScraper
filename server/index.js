require('dotenv').config();
const express = require('express');
const cors = require('cors');
const scrapeRoutes = require('./routes/scrape');
const exportRoutes = require('./routes/export');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', scrapeRoutes);
app.use('/api', exportRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});