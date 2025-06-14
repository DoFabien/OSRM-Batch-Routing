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

// Setup WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

// Track client subscriptions to jobs
const jobSubscriptions = new Map<string, Set<any>>();

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  
  // Handle subscription messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'subscribe' && message.jobId) {
        // Subscribe client to job updates
        if (!jobSubscriptions.has(message.jobId)) {
          jobSubscriptions.set(message.jobId, new Set());
        }
        jobSubscriptions.get(message.jobId)!.add(ws);
        logger.info(`Client subscribed to job: ${message.jobId}`);
      } else if (message.type === 'unsubscribe' && message.jobId) {
        // Unsubscribe client from job updates
        const subscribers = jobSubscriptions.get(message.jobId);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            jobSubscriptions.delete(message.jobId);
          }
        }
        logger.info(`Client unsubscribed from job: ${message.jobId}`);
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    // Clean up subscriptions for this client
    for (const [jobId, subscribers] of jobSubscriptions.entries()) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        jobSubscriptions.delete(jobId);
      }
    }
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Make WebSocket server and subscriptions available globally for job updates
declare global {
  var webSocketServer: WebSocketServer;
  var jobSubscriptions: Map<string, Set<any>>;
  function broadcastJobUpdate(jobId: string, data: any): void;
}
global.webSocketServer = wss;
global.jobSubscriptions = jobSubscriptions;

// Global function to broadcast job updates
global.broadcastJobUpdate = (jobId: string, data: any) => {
  const subscribers = jobSubscriptions.get(jobId);
  if (subscribers && subscribers.size > 0) {
    const message = JSON.stringify({
      type: 'job_update',
      jobId: jobId,
      data: data
    });
    
    // Send to all subscribers of this job
    for (const client of subscribers) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          logger.error(`Error sending WebSocket message to client:`, error);
          // Remove client if send fails
          subscribers.delete(client);
        }
      } else {
        // Remove disconnected clients
        subscribers.delete(client);
      }
    }
    
    // Clean up if no more subscribers
    if (subscribers.size === 0) {
      jobSubscriptions.delete(jobId);
    }
  }
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