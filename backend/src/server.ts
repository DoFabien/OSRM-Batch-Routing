import 'module-alias/register';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';

import { errorHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import apiRoutes from '@/routes/api';

const app = express();
const PORT = process.env['PORT'] || 80;
const OSRM_URL = process.env['OSRM_URL'] || 'http://localhost:5000';

// Security middleware - disabled for maximum compatibility
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// Rate limiting - Increased for batch processing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased to 1000 requests per windowMs for batch operations
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// General middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
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

// Configure server timeouts for long-running batch jobs
const JOB_TIMEOUT = parseInt(process.env['JOB_TIMEOUT'] || '3600000'); // 1 hour default
server.timeout = JOB_TIMEOUT; // Increase timeout for long batch jobs
server.keepAliveTimeout = JOB_TIMEOUT + 5000; // Keep alive slightly longer
server.headersTimeout = JOB_TIMEOUT + 10000; // Headers timeout

// Setup Socket.IO server for real-time updates
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

// Track client subscriptions to jobs
const jobSubscriptions = new Map<string, Set<string>>();

io.on('connection', (socket) => {
  logger.info(`Socket.IO client connected: ${socket.id}`);
  
  // Handle job subscription
  socket.on('subscribe', (jobId: string) => {
    if (!jobSubscriptions.has(jobId)) {
      jobSubscriptions.set(jobId, new Set());
    }
    jobSubscriptions.get(jobId)!.add(socket.id);
    socket.join(`job-${jobId}`);
    logger.info(`Client ${socket.id} subscribed to job: ${jobId}`);
  });
  
  // Handle job unsubscription
  socket.on('unsubscribe', (jobId: string) => {
    const subscribers = jobSubscriptions.get(jobId);
    if (subscribers) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        jobSubscriptions.delete(jobId);
      }
    }
    socket.leave(`job-${jobId}`);
    logger.info(`Client ${socket.id} unsubscribed from job: ${jobId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Socket.IO client disconnected: ${socket.id}`);
    // Clean up subscriptions for this client
    for (const [jobId, subscribers] of jobSubscriptions.entries()) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        jobSubscriptions.delete(jobId);
      }
    }
  });
});

// Make Socket.IO server available globally for job updates
declare global {
  var socketIOServer: SocketIOServer;
  function broadcastJobUpdate(jobId: string, data: any): void;
}
global.socketIOServer = io;

// Global function to broadcast job updates via Socket.IO
global.broadcastJobUpdate = (jobId: string, data: any) => {
  io.to(`job-${jobId}`).emit('job_update', {
    jobId: jobId,
    data: data
  });
  logger.debug(`Broadcasting job update for ${jobId}:`, data);
};

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