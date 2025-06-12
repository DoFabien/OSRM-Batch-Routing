import 'module-alias/register';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';

import { errorHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import apiRoutes from '@/routes/api';

const app = express();
const PORT = process.env['PORT'] || 80;
const OSRM_URL = process.env['OSRM_URL'] || 'http://localhost:5000';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// General middleware
app.use(cors());
app.use(compression());
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    osrmUrl: OSRM_URL,
    version: process.env['npm_package_version'] || '2.0.0'
  });
});

// Serve static files (Angular frontend)
if (process.env['NODE_ENV'] === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist/browser/browser')));
  
  // Serve Angular app for all other routes (catch-all)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/browser/browser/index.html'));
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Setup WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Make WebSocket server available globally for job updates
declare global {
  var webSocketServer: WebSocketServer;
}
global.webSocketServer = wss;

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📍 OSRM backend URL: ${OSRM_URL}`);
  logger.info(`🌍 Environment: ${process.env['NODE_ENV'] || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export default app;