import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { instanceManager } from './services/instanceManager';
import instancesRouter from './routes/instances';
import mcpRouter from './routes/mcp';
import { formatLog, LogLevel } from './mcp/utils/console';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/instances', instancesRouter);
app.use('/api/mcp', mcpRouter);

// Serve static files from frontend dist directory
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  formatLog(LogLevel.INFO, `Serving static files from ${distPath}`);
  app.use(express.static(distPath));
  
  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
async function start() {
  try {
    // Initialize services
    await instanceManager.initialize();
    formatLog(LogLevel.INFO, 'Instance Manager initialized');

    app.listen(PORT, () => {
      formatLog(LogLevel.INFO, `Server running on port ${PORT}`);
      formatLog(LogLevel.INFO, `API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
