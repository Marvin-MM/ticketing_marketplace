import amqp from 'amqplib';
import config from './index.js';
import logger from './logger.js';

let connection = null;
let channel = null;

// Queue names
export const QUEUES = {
  EMAIL: `${config.rabbitmq.queuePrefix}email`,
  PDF_GENERATION: `${config.rabbitmq.queuePrefix}pdf`,
  PAYMENT_PROCESSING: `${config.rabbitmq.queuePrefix}payment`,
  FINANCE_UPDATES: `${config.rabbitmq.queuePrefix}finance`,
  NOTIFICATIONS: `${config.rabbitmq.queuePrefix}notifications`,
  ANALYTICS: `${config.rabbitmq.queuePrefix}analytics`,
};

// Exchange configuration
const EXCHANGE = config.rabbitmq.exchange;
const EXCHANGE_TYPE = 'topic';

// Routing keys
export const ROUTING_KEYS = {
  EMAIL_SEND: 'email.send',
  EMAIL_WELCOME: 'email.welcome',
  EMAIL_BOOKING: 'email.booking',
  EMAIL_PAYMENT: 'email.payment',
  PDF_TICKET: 'pdf.ticket',
  PDF_INVOICE: 'pdf.invoice',
  PAYMENT_PROCESS: 'payment.process',
  PAYMENT_WEBHOOK: 'payment.webhook',
  FINANCE_CALCULATE: 'finance.calculate',
  FINANCE_WITHDRAWAL: 'finance.withdrawal',
  NOTIFICATION_PUSH: 'notification.push',
  ANALYTICS_UPDATE: 'analytics.update',
};

// Initialize RabbitMQ connection
export const connect = async () => {
  try {
    if (connection) {
      return { connection, channel };
    }

    // Create connection
    connection = await amqp.connect(config.rabbitmq.url);
    
    // Create channel
    channel = await connection.createChannel();
    
    // Set prefetch count for fair dispatch
    await channel.prefetch(1);
    
    // Assert exchange
    await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
    
    // Assert all queues
    for (const queueName of Object.values(QUEUES)) {
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // 24 hours
          'x-max-retries': 3,
        },
      });
    }
    
    // Bind queues to exchange with routing keys
    await channel.bindQueue(QUEUES.EMAIL, EXCHANGE, 'email.*');
    await channel.bindQueue(QUEUES.PDF_GENERATION, EXCHANGE, 'pdf.*');
    await channel.bindQueue(QUEUES.PAYMENT_PROCESSING, EXCHANGE, 'payment.*');
    await channel.bindQueue(QUEUES.FINANCE_UPDATES, EXCHANGE, 'finance.*');
    await channel.bindQueue(QUEUES.NOTIFICATIONS, EXCHANGE, 'notification.*');
    await channel.bindQueue(QUEUES.ANALYTICS, EXCHANGE, 'analytics.*');
    
    // Handle connection events
    connection.on('error', (error) => {
      logger.error('RabbitMQ connection error:', error);
      connection = null;
      channel = null;
    });
    
    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });
    
    logger.info('✅ RabbitMQ connected successfully');
    
    return { connection, channel };
  } catch (error) {
    logger.error('❌ Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

// Get channel (with auto-reconnect)
export const getChannel = async () => {
  if (!channel) {
    await connect();
  }
  return channel;
};

// Publish message to exchange
export const publishMessage = async (routingKey, message, options = {}) => {
  try {
    const channel = await getChannel();
    
    const messageBuffer = Buffer.from(JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || generateCorrelationId(),
    }));
    
    const publishOptions = {
      persistent: true,
      contentType: 'application/json',
      ...options,
    };
    
    const published = await channel.publish(
      EXCHANGE,
      routingKey,
      messageBuffer,
      publishOptions
    );
    
    if (!published) {
      throw new Error('Failed to publish message');
    }
    
    logger.debug('Message published', { routingKey, message });
    
    return true;
  } catch (error) {
    logger.error('Failed to publish message:', error);
    throw error;
  }
};

// Consume messages from queue
export const consumeQueue = async (queueName, handler, options = {}) => {
  try {
    const channel = await getChannel();
    
    await channel.consume(
      queueName,
      async (message) => {
        if (!message) return;
        
        const content = JSON.parse(message.content.toString());
        const retryCount = (message.properties.headers?.['x-retry-count'] || 0);
        
        try {
          // Process message
          await handler(content, message);
          
          // Acknowledge message
          channel.ack(message);
          
          logger.debug('Message processed successfully', { queueName, content });
        } catch (error) {
          logger.error('Error processing message:', error);
          
          // Check retry limit
          if (retryCount < 3) {
            // Requeue with incremented retry count
            const retryOptions = {
              ...message.properties,
              headers: {
                ...message.properties.headers,
                'x-retry-count': retryCount + 1,
              },
            };
            
            // Republish to the same queue with delay
            setTimeout(() => {
              channel.sendToQueue(
                queueName,
                message.content,
                retryOptions
              );
            }, Math.pow(2, retryCount) * 1000); // Exponential backoff
            
            // Acknowledge the original message
            channel.ack(message);
          } else {
            // Send to dead letter queue
            await publishMessage('dlq.failed', {
              originalQueue: queueName,
              content,
              error: error.message,
              retryCount,
            });
            
            // Acknowledge and don't requeue
            channel.ack(message);
          }
        }
      },
      {
        noAck: false,
        ...options,
      }
    );
    
    logger.info(`Consumer started for queue: ${queueName}`);
  } catch (error) {
    logger.error('Failed to start consumer:', error);
    throw error;
  }
};

// Helper functions for specific message types

// Email queue helpers
export const emailQueue = {
  sendWelcome: async (userData) => {
    return publishMessage(ROUTING_KEYS.EMAIL_WELCOME, {
      type: 'WELCOME',
      to: userData.email,
      data: userData,
    });
  },
  
  sendBookingConfirmation: async (bookingData) => {
    return publishMessage(ROUTING_KEYS.EMAIL_BOOKING, {
      type: 'BOOKING_CONFIRMATION',
      to: bookingData.customerEmail,
      data: bookingData,
    });
  },
  
  sendPaymentNotification: async (paymentData) => {
    return publishMessage(ROUTING_KEYS.EMAIL_PAYMENT, {
      type: 'PAYMENT_NOTIFICATION',
      to: paymentData.customerEmail,
      data: paymentData,
    });
  },
};

// PDF queue helpers
export const pdfQueue = {
  generateTicket: async (ticketData) => {
    return publishMessage(ROUTING_KEYS.PDF_TICKET, {
      type: 'TICKET',
      data: ticketData,
    });
  },
  
  generateInvoice: async (invoiceData) => {
    return publishMessage(ROUTING_KEYS.PDF_INVOICE, {
      type: 'INVOICE',
      data: invoiceData,
    });
  },
};

// Payment queue helpers
export const paymentQueue = {
  processPayment: async (paymentData) => {
    return publishMessage(ROUTING_KEYS.PAYMENT_PROCESS, {
      type: 'PROCESS',
      data: paymentData,
    });
  },
  
  handleWebhook: async (webhookData) => {
    return publishMessage(ROUTING_KEYS.PAYMENT_WEBHOOK, {
      type: 'WEBHOOK',
      data: webhookData,
    });
  },
};

// Finance queue helpers
export const financeQueue = {
  updateBalances: async (financeData) => {
    return publishMessage(ROUTING_KEYS.FINANCE_CALCULATE, {
      type: 'UPDATE_BALANCES',
      data: financeData,
    });
  },
  
  processWithdrawal: async (withdrawalData) => {
    return publishMessage(ROUTING_KEYS.FINANCE_WITHDRAWAL, {
      type: 'WITHDRAWAL',
      data: withdrawalData,
    });
  },
};

// Generate correlation ID
const generateCorrelationId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

// Graceful shutdown
export const disconnect = async () => {
  try {
    if (channel) {
      await channel.close();
      logger.info('RabbitMQ channel closed');
    }
    
    if (connection) {
      await connection.close();
      logger.info('RabbitMQ connection closed');
    }
  } catch (error) {
    logger.error('Error closing RabbitMQ connection:', error);
  }
};

// Register shutdown handlers
process.on('SIGINT', disconnect);
process.on('SIGTERM', disconnect);

export default {
  connect,
  getChannel,
  publishMessage,
  consumeQueue,
  disconnect,
  QUEUES,
  ROUTING_KEYS,
  emailQueue,
  pdfQueue,
  paymentQueue,
  financeQueue,
};