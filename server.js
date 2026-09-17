import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ─────────── MOCK BRIDGE API ───────────
const delay = ms => new Promise(res => setTimeout(res, ms));

app.post('/api/app_info', (req, res) => {
  res.json({ ok: true, version: '1.5.0' });
});

app.post('/api/theme_get', (req, res) => {
  res.json({ ok: true, theme: 'light' });
});

app.post('/api/ui_scale_get', (req, res) => {
  res.json({ ok: true, scale: 'md' });
});

app.post('/api/theme_save', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/ui_scale_save', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth_revalidate', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/app_check_update', (req, res) => {
  res.json({ ok: true, update: false });
});

app.post('/api/ui_pending_module', (req, res) => {
  res.json({ ok: true, module: null });
});

app.post('/api/ui_load_module', async (req, res) => {
  try {
    const { name } = req.body;
    const modDir = path.join(__dirname, 'acmfacil', 'ui', 'modules', name);
    
    let html = '';
    let css = '';
    let js = '';

    const fs = await import('fs/promises');
    try { html = await fs.readFile(path.join(modDir, 'panel.html'), 'utf8'); } catch(e){}
    try { css = await fs.readFile(path.join(modDir, 'panel.css'), 'utf8'); } catch(e){}
    try { js = await fs.readFile(path.join(modDir, 'panel.js'), 'utf8'); } catch(e){}

    res.json({ ok: true, html, css, js });
  } catch(e) {
    res.json({ ok: false, code: 'ui.load_error', error: e.message });
  }
});

app.post('/api/empresa_get', (req, res) => {
  res.json({ ok: true, empresa: {} });
});

app.post('/api/empresa_save', async (req, res) => {
  await delay(500);
  res.json({ ok: true });
});

app.post('/api/auth_login', (req, res) => {
  res.json({ 
    ok: true,
    user: {
      local_id: 'mock-user',
      email: 'mock@local',
      nome: 'Mock User',
      role: 'admin',
      status: 'active',
      modules: ['auto_acm', 'auto_acm_curvo', 'auto_sigame', 'textura_sync', 'logo3d', 'planifica', 'corte_encaixe']
    },
    license: {
      plan: 'admin',
      status: 'active',
      paid: true
    }
  });
});

app.post('/api/auth_saved_email', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth_get_block_msg', (req, res) => {
  res.json({ ok: true });
});

// Fallback for any other bridge calls (e.g. geometric tool, 3d lettering generation, etc)
app.post('/api/:action', async (req, res) => {
  console.log(`[Bridge Mock] Action called: ${req.params.action}`, req.body);
  await delay(500);
  res.json({ ok: true, msg: 'Mock response from Node.js server.' });
});


// ─────────── STATIC FILES ───────────
app.use(express.static(path.join(__dirname, 'acmfacil', 'ui')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'acmfacil', 'ui', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
