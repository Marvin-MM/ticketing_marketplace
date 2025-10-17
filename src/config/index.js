import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  app: {
    name: process.env.APP_NAME || 'Ticketing Marketplace',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    url: process.env.APP_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
    apiVersion: process.env.API_VERSION || 'v1',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },
  
  database: {
    url: process.env.DATABASE_URL,
  },
  
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'ticketing_exchange',
    queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX || 'ticketing_',
  },
  
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    },
    session: {
      secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
      maxAge: parseInt(process.env.SESSION_COOKIE_MAX_AGE, 10) || 86400000, // 24 hours
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'change-this-jwt-secret',
      expiry: process.env.JWT_EXPIRY || '7d',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
      refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
    },
    superAdminEmails: process.env.SUPER_ADMIN_EMAILS?.split(',').map(email => email.trim()) || [],
  },
  
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  
  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY,
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
  },

  pesapal: {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
    environment: process.env.PESAPAL_ENVIRONMENT || 'sandbox',
  },
  
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'Ticketing Marketplace <noreply@ticketing.com>',
  },
  
  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    encryption: {
      key: process.env.ENCRYPTION_KEY || 'change-this-32-character-key-now',
      algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    },
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH,
  },
  
  payment: {
    expiryMinutes: parseInt(process.env.PAYMENT_EXPIRY_MINUTES, 10) || 15,
    retryMax: parseInt(process.env.PAYMENT_RETRY_MAX, 10) || 3,
  },
  
  ticket: {
    validityHours: parseInt(process.env.TICKET_VALIDITY_HOURS, 10) || 24,
    qrCodeSecret: process.env.QR_CODE_SECRET || 'change-this-qr-secret',
  },
};

// Validate required configurations
const validateConfig = () => {
  const requiredConfigs = [
    'database.url',
    'auth.google.clientId',
    'auth.google.clientSecret',
    'auth.session.secret',
    'auth.jwt.secret',
  ];
  
  const missingConfigs = [];
  
  requiredConfigs.forEach(configPath => {
    const keys = configPath.split('.');
    let value = config;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    if (!value) {
      missingConfigs.push(configPath);
    }
  });
  
  if (missingConfigs.length > 0 && config.app.isProduction) {
    throw new Error(`Missing required configuration: ${missingConfigs.join(', ')}`);
  }
  
  if (missingConfigs.length > 0 && !config.app.isProduction) {
    console.warn(`Warning: Missing configuration: ${missingConfigs.join(', ')}`);
  }
};

validateConfig();

export default config;