import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { config } from './config/keys.js';
import vaultRoutes from './routes/vaultRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { startSentinel } from './services/sentinelService.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'Heirloom API active',
      pinataConfigured: config.pinata.isConfigured,
      timestamp: new Date().toISOString(),
    },
  });
});

// Mount API routes
app.use('/api/v1/vaults', vaultRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Initialize DB and start Sentinel monitor
connectDB().then(() => {
  startSentinel(30000);
});

const PORT = config.port;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

export default app;
