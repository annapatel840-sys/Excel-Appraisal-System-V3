const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);
const distPath = path.join(__dirname, '..', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'employee-appraisal', runtime: 'nodejs' });
});

app.use(express.static(distPath, { index: 'index.html' }));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Employee Appraisal Management listening on port ${port}`);
});
