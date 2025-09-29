import { PrismaClient } from '@prisma/client';
import config from './index.js';
import logger from './logger.js';

// Create a single Prisma client instance
const prisma = new PrismaClient({
  log: config.app.isDevelopment ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: config.app.isDevelopment ? 'pretty' : 'minimal',
});

// Handle Prisma connection events
prisma.$on('query', (e) => {
  if (config.app.isDevelopment) {
    logger.debug('Query: ' + e.query);
    logger.debug('Duration: ' + e.duration + 'ms');
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from database');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Test database connection
export const testDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
};

export default prisma;