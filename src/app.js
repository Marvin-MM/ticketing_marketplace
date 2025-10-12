import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

// Config imports
import config from './config/index.js';
import logger from './config/logger.js';
import { testDatabaseConnection } from './config/database.js';
import redis, { publisher, subscriber } from './config/redis.js';
import rabbitmq from './config/rabbitmq.js';

// Middleware imports
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler.js';

// Module route imports
import authRoutes from './modules/auth/routes/auth.routes.js';
import campaignRoutes from './modules/campaigns/routes/campaign.routes.js';
import bookingRoutes from './modules/bookings/routes/booking.routes.js';
import paymentRoutes from './modules/payments/routes/payment.routes.js';
import validationRoutes from './modules/validation/routes/validation.routes.js';
import financeRoutes from './modules/finance/routes/finance.routes.js';

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Socket.io
// const io = new Server(server, {
//   cors: {
//     origin: config.security.corsOrigin,
//     credentials: true,
//   },
// });
const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
});

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", 'data:', 'https:'],
//     },
//   },
// }));

// CORS configuration
// app.use(cors({
//   origin: config.security.corsOrigin,
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
// }));
// app.use(cors());

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Initialize Passport (for Google OAuth only)
app.use(passport.initialize());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
});

const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many booking attempts, please try again later.',
});

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/bookings/', bookingLimiter);

// Request logging
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.app.env,
  });
});

// API version prefix
const apiPrefix = `/api/${config.app.apiVersion}`;

// Mount module routes
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/campaigns`, campaignRoutes);
app.use(`${apiPrefix}/bookings`, bookingRoutes);
app.use(`${apiPrefix}/payments`, paymentRoutes);
app.use(`${apiPrefix}/validation`, validationRoutes);
app.use(`${apiPrefix}/finance`, financeRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('New WebSocket connection', { socketId: socket.id });

  // Join campaign room for live updates
  socket.on('join:campaign', (campaignId) => {
    socket.join(`campaign:${campaignId}`);
    logger.debug('Socket joined campaign room', { socketId: socket.id, campaignId });
  });

  // Leave campaign room
  socket.on('leave:campaign', (campaignId) => {
    socket.leave(`campaign:${campaignId}`);
    logger.debug('Socket left campaign room', { socketId: socket.id, campaignId });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info('WebSocket disconnected', { socketId: socket.id });
  });
});

// Subscribe to Redis pub/sub for real-time updates
subscriber.subscribe('booking:update', (err) => {
  if (err) {
    logger.error('Failed to subscribe to booking updates:', err);
  }
});

subscriber.on('message', (channel, message) => {
  if (channel === 'booking:update') {
    const data = JSON.parse(message);
    io.to(`campaign:${data.campaignId}`).emit('booking:counter', data);
  }
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testDatabaseConnection();

    // Connect to RabbitMQ
    await rabbitmq.connect();

    // Start server
    server.listen(config.app.port, () => {
      logger.info(`🚀 Server running on port ${config.app.port} in ${config.app.env} mode`);
      logger.info(`📍 API URL: ${config.app.url}${apiPrefix}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close Socket.io connections
      io.close(() => {
        logger.info('Socket.io connections closed');
      });

      // Disconnect from services
      await rabbitmq.disconnect();
      
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Start the server
startServer();

export { app, server, io };