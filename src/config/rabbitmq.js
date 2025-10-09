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
  BOOKING_CONFIRMATION: `${config.rabbitmq.queuePrefix}booking_confirmation`,
  DEAD_LETTER: `${config.rabbitmq.queuePrefix}dead_letter`, // Queue for failed jobs
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
  EMAIL_MANAGER_INVITATION: 'email.manager.invitation',
  PDF_TICKET: 'pdf.ticket',
  PDF_INVOICE: 'pdf.invoice',
  PAYMENT_PROCESS: 'payment.process',
  PAYMENT_WEBHOOK: 'payment.webhook',
  FINANCE_CALCULATE: 'finance.calculate',
  FINANCE_WITHDRAWAL: 'finance.withdrawal',
  NOTIFICATION_PUSH: 'notification.push',
  BOOKING_CONFIRM: 'booking.confirm',
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
    
    // Assert main exchange
    await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

    // Set up the Dead-Letter Exchange (DLX) infrastructure
    const DLX_EXCHANGE = `${EXCHANGE}_dlx`;
    const DLX_ROUTING_KEY = 'failed';
    await channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(QUEUES.DEAD_LETTER, { durable: true });
    await channel.bindQueue(QUEUES.DEAD_LETTER, DLX_EXCHANGE, DLX_ROUTING_KEY);
    
    // Assert all main queues and link them to the DLX
    for (const queueName of Object.values(QUEUES)) {
      // The dead-letter queue itself doesn't need a DLX
      if (queueName === QUEUES.DEAD_LETTER) continue; 
      
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // 24 hours
          'x-dead-letter-exchange': DLX_EXCHANGE,
          'x-dead-letter-routing-key': DLX_ROUTING_KEY,
        },
      });
    }
    
    // Bind queues to exchange with routing keys
    await channel.bindQueue(QUEUES.EMAIL, EXCHANGE, 'email.#');
    await channel.bindQueue(QUEUES.PDF_GENERATION, EXCHANGE, 'pdf.*');
    await channel.bindQueue(QUEUES.PAYMENT_PROCESSING, EXCHANGE, 'payment.*');
    await channel.bindQueue(QUEUES.FINANCE_UPDATES, EXCHANGE, 'finance.*');
    await channel.bindQueue(QUEUES.NOTIFICATIONS, EXCHANGE, 'notification.*');
    await channel.bindQueue(QUEUES.BOOKING_CONFIRMATION, EXCHANGE, 'booking.*');
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
          
          // Acknowledge message on success
          channel.ack(message);
          
          logger.debug('Message processed successfully', { queueName, content });
        } catch (error) {
          logger.error('Error processing message:', { 
            error: error.message, 
            queueName, 
            retryCount 
          });
          
          // Check retry limit
          if (retryCount < 3) {
            // Re-publish the message for a delayed retry
            const retryOptions = {
              ...message.properties,
              headers: {
                ...message.properties.headers,
                'x-retry-count': retryCount + 1,
              },
            };
            
            setTimeout(() => {
              channel.sendToQueue(
                queueName,
                message.content,
                retryOptions
              );
            }, Math.pow(2, retryCount) * 1000); // Exponential backoff
            
            // Acknowledge the original message so it's removed from the queue
            channel.ack(message);
          } else {
            // After max retries, reject the message to dead-letter it
            logger.error(`Message failed after 3 retries. Moving to dead-letter queue.`, { queueName, content });
            // Reject the message and tell RabbitMQ not to requeue it.
            // The queue's DLX configuration will handle moving it to the dead-letter queue.
            channel.nack(message, false, false);
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

  sendManagerInvitation: async (userData) => {
    return publishMessage(ROUTING_KEYS.EMAIL_MANAGER_INVITATION, {
      type: 'MANAGER_INVITATION',
      to: userData.email,
      data: userData,
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

  monitorPayment: async (paymentData) => {
    return publishMessage(ROUTING_KEYS.PAYMENT_MONITOR, {
      type: 'MONITOR',
      data: paymentData,
    });
  },
};

// Booking queue helpers
export const bookingQueue = {
  confirmBooking: async (bookingId, paymentId) => {
    return publishMessage(ROUTING_KEYS.BOOKING_CONFIRM, {
      type: 'CONFIRM_BOOKING',
      bookingId,
      paymentId,
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
  bookingQueue,
};