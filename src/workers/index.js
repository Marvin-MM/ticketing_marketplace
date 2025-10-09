// import rabbitmq, { QUEUES, consumeQueue } from '../config/rabbitmq.js';
// import logger from '../config/logger.js';
// import { generateTicketPDF, generateInvoicePDF } from '../shared/services/pdfService.js';
// import { 
//   sendWelcomeEmail, 
//   sendBookingConfirmationEmail, 
//   sendPaymentNotificationEmail, 
//   sendManagerInvitationEmail 
// } from '../shared/services/emailService.js';
// import { generateUniqueId } from '../shared/utils/encryption.js'; // Needed for ticket generation
// import prisma from '../config/database.js';

// /**
//  * Email worker - processes email sending tasks
//  */
// const startEmailWorker = async () => {
//   logger.info('Starting Email Worker...');
  
//   await consumeQueue(QUEUES.EMAIL, async (data, message) => {
//     try {
//       const { type, to, data: emailData } = data;
      
//       switch (type) {
//         case 'WELCOME':
//           await sendWelcomeEmail(emailData);
//           break;
          
//         case 'BOOKING_CONFIRMATION':
//           await sendBookingConfirmationEmail(emailData);
//           break;
          
//         case 'PAYMENT_NOTIFICATION':
//           await sendPaymentNotificationEmail(emailData);
//           break;

//         case 'MANAGER_INVITATION':

          
//         default:
//           logger.warn('Unknown email type:', type);
//       }
      
//       logger.info('Email processed successfully', { type, to });
//     } catch (error) {
//       logger.error('Email worker error:', error);
//       throw error;
//     }
//   });
// };

// /**
//  * PDF worker - processes PDF generation tasks
//  */
// const startPDFWorker = async () => {
//   logger.info('Starting PDF Worker...');
  
//   await consumeQueue(QUEUES.PDF_GENERATION, async (data, message) => {
//     try {
//       const { type, data: pdfData } = data;
      
//       switch (type) {
//         case 'TICKET':
//           const result = await generateTicketPDF(pdfData);
//           logger.info('Ticket PDF generated', { 
//             ticketId: result.ticketId, 
//             pdfUrl: result.pdfUrl 
//           });
//           break;
          
//         case 'INVOICE':
//           const invoiceUrl = await generateInvoicePDF(pdfData);
//           logger.info('Invoice PDF generated', { invoiceUrl });
//           break;
          
//         default:
//           logger.warn('Unknown PDF type:', type);
//       }
//     } catch (error) {
//       logger.error('PDF worker error:', error);
//       throw error;
//     }
//   });
// };

// /**
//  * Booking worker - processes booking confirmation tasks
//  */
// const startBookingWorker = async () => {
//   logger.info('Starting Booking Worker...');
//   await consumeQueue(QUEUES.BOOKING_CONFIRMATION, async (data, message) => {
//     try {
//       const { type, bookingId, paymentId } = data;
      
//       if (type === 'CONFIRM_BOOKING') {
//         await confirmBookingAndFinalize(bookingId, paymentId);
//       } else {
//         logger.warn('Unknown booking task type:', type);
//       }
//     } catch (error) {
//       logger.error('Booking worker error:', error);
//       throw error; // Re-throw to trigger retry/DLQ logic
//     }
//   });
// };

// /**
//  * Payment worker - processes payment-related tasks
//  */
// const startPaymentWorker = async () => {
//   logger.info('Starting Payment Worker...');
  
//   await consumeQueue(QUEUES.PAYMENT_PROCESSING, async (data, message) => {
//     try {
//       const { type, data: paymentData } = data;
      
//       switch (type) {
//         case 'PROCESS':
//           // Handle payment processing logic if needed
//           logger.info('Payment processing task', paymentData);
//           break;
          
//         case 'WEBHOOK':
//           // Handle webhook processing
//           logger.info('Payment webhook processing', paymentData);
//           break;
          
//         default:
//           logger.warn('Unknown payment task type:', type);
//       }
//     } catch (error) {
//       logger.error('Payment worker error:', error);
//       throw error;
//     }
//   });
// };

// /**
//  * Finance worker - processes financial operations
//  */
// const startFinanceWorker = async () => {
//   logger.info('Starting Finance Worker...');
  
//   await consumeQueue(QUEUES.FINANCE_UPDATES, async (data, message) => {
//     try {
//       const { type, data: financeData } = data;
      
//       switch (type) {
//         case 'UPDATE_BALANCES':
//           await updateSellerBalances(financeData);
//           break;
          
//         case 'WITHDRAWAL':
//           await processWithdrawalRequest(financeData);
//           break;
          
//         default:
//           logger.warn('Unknown finance task type:', type);
//       }
//     } catch (error) {
//       logger.error('Finance worker error:', error);
//       throw error;
//     }
//   });
// };

// /**
//  * Update seller balances based on completed sales
//  */
// const updateSellerBalances = async (data) => {
//   const { sellerId, amount, transactionId } = data;
  
//   try {
//     await prisma.finance.update({
//       where: { sellerId },
//       data: {
//         availableBalance: { increment: amount },
//         totalEarnings: { increment: amount },
//       },
//     });
    
//     logger.info('Seller balance updated', { sellerId, amount });
//   } catch (error) {
//     logger.error('Error updating seller balance:', error);
//     throw error;
//   }
// };

// /**
//  * Process withdrawal request
//  */
// const processWithdrawalRequest = async (data) => {
//   const { withdrawalId, sellerId, amount, methodId } = data;
  
//   try {
//     // In a real implementation, this would integrate with payment providers
//     // For now, we'll simulate the withdrawal processing
    
//     // Update withdrawal status to processing
//     await prisma.withdrawal.update({
//       where: { id: withdrawalId },
//       data: { 
//         status: 'PROCESSING',
//         processedAt: new Date(),
//       },
//     });
    
//     // Simulate processing time
//     await new Promise(resolve => setTimeout(resolve, 5000));
    
//     // Mark as completed (in real scenario, this would be based on provider response)
//     await prisma.withdrawal.update({
//       where: { id: withdrawalId },
//       data: { 
//         status: 'COMPLETED',
//         processedAt: new Date(),
//       },
//     });
    
//     // Update finance record
//     const finance = await prisma.finance.findUnique({
//       where: { sellerId },
//     });
    
//     if (finance) {
//       await prisma.finance.update({
//         where: { sellerId },
//         data: {
//           pendingBalance: { decrement: amount },
//           withdrawnAmount: { increment: amount },
//           lastWithdrawalAt: new Date(),
//         },
//       });
//     }
    
//     logger.info('Withdrawal processed successfully', { withdrawalId, sellerId, amount });
//   } catch (error) {
//     // Mark withdrawal as failed
//     await prisma.withdrawal.update({
//       where: { id: withdrawalId },
//       data: { 
//         status: 'FAILED',
//         failureReason: error.message,
//       },
//     });
    
//     logger.error('Withdrawal processing failed:', error);
//     throw error;
//   }
// };

// /**
//  * Analytics worker - processes analytics updates
//  */
// const startAnalyticsWorker = async () => {
//   logger.info('Starting Analytics Worker...');
  
//   await consumeQueue(QUEUES.ANALYTICS, async (data, message) => {
//     try {
//       const { type, data: analyticsData } = data;
      
//       switch (type) {
//         case 'UPDATE':
//           await updateCampaignAnalytics(analyticsData);
//           break;
          
//         default:
//           logger.warn('Unknown analytics task type:', type);
//       }
//     } catch (error) {
//       logger.error('Analytics worker error:', error);
//       throw error;
//     }
//   });
// };

// /**
//  * Update campaign analytics
//  */
// const updateCampaignAnalytics = async (data) => {
//   const { campaignId, eventType, metrics } = data;
  
//   try {
//     await prisma.campaignAnalytics.update({
//       where: { campaignId },
//       data: {
//         ...metrics,
//         lastCalculatedAt: new Date(),
//       },
//     });
    
//     logger.info('Campaign analytics updated', { campaignId, eventType });
//   } catch (error) {
//     logger.error('Error updating campaign analytics:', error);
//     throw error;
//   }
// };

// /**
//  * Logic to confirm a booking, generate tickets, and update finances.
//  * This is the logic we moved from the payment controller/service.
//  */
// const confirmBookingAndFinalize = async (bookingId, paymentId) => {
//   const result = await prisma.$transaction(async (tx) => {
//     // Get booking and payment details
//     const booking = await tx.booking.findUnique({
//       where: { id: bookingId },
//       include: { campaign: true, customer: true },
//     });
//     const payment = await tx.payment.findUnique({ where: { id: paymentId } });

//     if (!booking || !payment || booking.status === 'CONFIRMED') {
//       logger.warn('Booking already confirmed or not found, skipping finalization.', { bookingId });
//       return null;
//     }

//     // 1. Update booking status
//     const updatedBooking = await tx.booking.update({
//       where: { id: bookingId },
//       data: { status: 'CONFIRMED', confirmedAt: new Date() },
//     });

//     // 2. Generate tickets
//     const tickets = [];
//     const ticketCount = booking.issuanceType === 'SINGLE' ? 1 : booking.quantity;
//     for (let i = 0; i < ticketCount; i++) {
//       const ticket = await tx.ticket.create({
//         data: {
//           ticketNumber: generateUniqueId('TKT'),
//           bookingId,
//           campaignId: booking.campaignId,
//           customerId: booking.customerId,
//           ticketType: booking.ticketType,
//           qrCode: '', // Will be updated by PDF worker
//           qrSecurityKey: generateSecureToken(16),
//           status: 'VALID',
//           maxScans: booking.campaign.isMultiScan ? booking.campaign.maxScansPerTicket : 1,
//           validFrom: booking.campaign.startDate,
//           validUntil: booking.campaign.endDate,
//         },
//       });
//       tickets.push(ticket);
//     }

//     // 3. Update campaign analytics
//     await tx.campaignAnalytics.update({
//       where: { campaignId: booking.campaignId },
//       data: {
//         completedBookings: { increment: 1 },
//         totalRevenue: { increment: booking.totalAmount },
//       },
//     });

//     // 4. Update seller's finance
//     const finance = await tx.finance.findUnique({ where: { sellerId: booking.campaign.sellerId } });
//     if (finance) {
//       const newPendingBalance = Number(finance.pendingBalance) + Number(booking.totalAmount);
//       await tx.finance.update({
//         where: { id: finance.id },
//         data: {
//           pendingBalance: { increment: booking.totalAmount },
//           totalEarnings: { increment: booking.totalAmount },
//         },
//       });
//       // 5. Create transaction record
//       await tx.transaction.create({
//         data: {
//           financeId: finance.id,
//           userId: booking.campaign.sellerId,
//           paymentId,
//           type: 'SALE',
//           amount: booking.totalAmount,
//           balanceBefore: finance.pendingBalance,
//           balanceAfter: newPendingBalance,
//           reference: booking.bookingRef,
//           description: `Ticket sale for ${booking.campaign.title}`,
//         },
//       });
//     }
//     return { booking: updatedBooking, tickets, customer: booking.customer, campaign: booking.campaign };
//   });

//   if (!result) return; // Stop if booking was already processed

//   // 6. Queue post-confirmation tasks (outside the transaction)
//   for (const ticket of result.tickets) {
//     await rabbitmq.pdfQueue.generateTicket({ ticketId: ticket.id });
//   }

//   await rabbitmq.emailQueue.sendBookingConfirmation({
//     bookingId,
//     customerEmail: result.customer.email,
//     customerName: `${result.customer.firstName} ${result.customer.lastName}`,
//     bookingRef: result.booking.bookingRef,
//     eventTitle: result.campaign.title,
//     eventDate: result.campaign.eventDate,
//     ticketCount: result.tickets.length,
//   });

//   logger.info('Booking confirmed and finalized successfully', { bookingId, paymentId });
// };

// /**
//  * Start all workers
//  */
// export const startAllWorkers = async () => {
//   try {
//     // Connect to RabbitMQ
//     await rabbitmq.connect();
    
//     // Start all workers
//     await Promise.all([
//       startEmailWorker(),
//       startPDFWorker(),
//       startPaymentWorker(),
//       startFinanceWorker(),
//       startAnalyticsWorker(),
//       startBookingWorker(), // Add the new worker to the startup process
//     ]);
    
//     logger.info('🚀 All background workers started successfully');
//   } catch (error) {
//     logger.error('Failed to start workers:', error);
//     throw error;
//   }
// };

// /**
//  * Graceful shutdown of all workers
//  */
// export const stopAllWorkers = async () => {
//   try {
//     await rabbitmq.disconnect();
//     logger.info('All workers stopped successfully');
//   } catch (error) {
//     logger.error('Error stopping workers:', error);
//     throw error;
//   }
// };

// // Handle process termination
// process.on('SIGINT', async () => {
//   logger.info('Received SIGINT, shutting down workers...');
//   await stopAllWorkers();
//   process.exit(0);
// });

// process.on('SIGTERM', async () => {
//   logger.info('Received SIGTERM, shutting down workers...');
//   await stopAllWorkers();
//   process.exit(0);
// });

// // Start workers if this file is run directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   startAllWorkers().catch(error => {
//     logger.error('Failed to start workers:', error);
//     process.exit(1);
//   });
// }


import rabbitmq, { QUEUES, consumeQueue } from '../config/rabbitmq.js';
import logger from '../config/logger.js';
import { generateTicketPDF, generateInvoicePDF } from '../shared/services/pdfService.js';
import { 
  sendWelcomeEmail, 
  sendBookingConfirmationEmail, 
  sendPaymentNotificationEmail, 
  sendManagerInvitationEmail 
} from '../shared/services/emailService.js';
import { generateUniqueId } from '../shared/utils/encryption.js';
import prisma from '../config/database.js';
import crypto from 'crypto'; // ADD THIS IMPORT

// ADD THIS HELPER FUNCTION
const generateSecureToken = (length = 16) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Email worker - processes email sending tasks
 */
const startEmailWorker = async () => {
  logger.info('Starting Email Worker...');
  
  await consumeQueue(QUEUES.EMAIL, async (data, message) => {
    try {
      const { type, to, data: emailData } = data;
      
      switch (type) {
        case 'WELCOME':
          await sendWelcomeEmail(emailData);
          break;
          
        case 'BOOKING_CONFIRMATION':
          await sendBookingConfirmationEmail(emailData);
          break;
          
        case 'PAYMENT_NOTIFICATION':
          await sendPaymentNotificationEmail(emailData);
          break;

        case 'MANAGER_INVITATION':
          await sendManagerInvitationEmail(emailData);
          break;
          
        default:
          logger.warn('Unknown email type:', type);
      }
      
      logger.info('Email processed successfully', { type, to });
    } catch (error) {
      logger.error('Email worker error:', error);
      throw error;
    }
  });
};

/**
 * PDF worker - processes PDF generation tasks
 */
const startPDFWorker = async () => {
  logger.info('Starting PDF Worker...');
  
  await consumeQueue(QUEUES.PDF_GENERATION, async (data, message) => {
    try {
      const { type, data: pdfData } = data;
      
      switch (type) {
        case 'TICKET':
          const result = await generateTicketPDF(pdfData);
          logger.info('Ticket PDF generated', { 
            ticketId: result.ticketId, 
            pdfUrl: result.pdfUrl 
          });
          break;
          
        case 'INVOICE':
          const invoiceUrl = await generateInvoicePDF(pdfData);
          logger.info('Invoice PDF generated', { invoiceUrl });
          break;
          
        default:
          logger.warn('Unknown PDF type:', type);
      }
    } catch (error) {
      logger.error('PDF worker error:', error);
      throw error;
    }
  });
};

/**
 * Booking worker - processes booking confirmation tasks
 */
const startBookingWorker = async () => {
  logger.info('Starting Booking Worker...');
  await consumeQueue(QUEUES.BOOKING_CONFIRMATION, async (data, message) => {
    try {
      const { type, bookingId, paymentId } = data;
      
      if (type === 'CONFIRM_BOOKING') {
        await confirmBookingAndFinalize(bookingId, paymentId);
      } else {
        logger.warn('Unknown booking task type:', type);
      }
    } catch (error) {
      logger.error('Booking worker error:', error);
      throw error;
    }
  });
};

/**
 * Payment worker - processes payment-related tasks
 */
const startPaymentWorker = async () => {
  logger.info('Starting Payment Worker...');
  
  await consumeQueue(QUEUES.PAYMENT_PROCESSING, async (data, message) => {
    try {
      const { type, data: paymentData } = data;
      
      switch (type) {
        case 'PROCESS':
          logger.info('Payment processing task', paymentData);
          break;
          
        case 'WEBHOOK':
          logger.info('Payment webhook processing', paymentData);
          break;

        case 'MONITOR':
          logger.info('Payment monitoring task', paymentData);
          // Add payment monitoring logic if needed
          break;
          
        default:
          logger.warn('Unknown payment task type:', type);
      }
    } catch (error) {
      logger.error('Payment worker error:', error);
      throw error;
    }
  });
};

/**
 * Finance worker - processes financial operations
 */
const startFinanceWorker = async () => {
  logger.info('Starting Finance Worker...');
  
  await consumeQueue(QUEUES.FINANCE_UPDATES, async (data, message) => {
    try {
      const { type, data: financeData } = data;
      
      switch (type) {
        case 'UPDATE_BALANCES':
          await updateSellerBalances(financeData);
          break;
          
        case 'WITHDRAWAL':
          await processWithdrawalRequest(financeData);
          break;
          
        default:
          logger.warn('Unknown finance task type:', type);
      }
    } catch (error) {
      logger.error('Finance worker error:', error);
      throw error;
    }
  });
};

/**
 * Update seller balances based on completed sales
 */
const updateSellerBalances = async (data) => {
  const { sellerId, amount, transactionId } = data;
  
  try {
    await prisma.finance.update({
      where: { sellerId },
      data: {
        availableBalance: { increment: amount },
        totalEarnings: { increment: amount },
      },
    });
    
    logger.info('Seller balance updated', { sellerId, amount });
  } catch (error) {
    logger.error('Error updating seller balance:', error);
    throw error;
  }
};

/**
 * Process withdrawal request
 */
const processWithdrawalRequest = async (data) => {
  const { withdrawalId, sellerId, amount, methodId } = data;
  
  try {
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { 
        status: 'PROCESSING',
        processedAt: new Date(),
      },
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { 
        status: 'COMPLETED',
        processedAt: new Date(),
      },
    });
    
    const finance = await prisma.finance.findUnique({
      where: { sellerId },
    });
    
    if (finance) {
      await prisma.finance.update({
        where: { sellerId },
        data: {
          pendingBalance: { decrement: amount },
          withdrawnAmount: { increment: amount },
          lastWithdrawalAt: new Date(),
        },
      });
    }
    
    logger.info('Withdrawal processed successfully', { withdrawalId, sellerId, amount });
  } catch (error) {
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { 
        status: 'FAILED',
        failureReason: error.message,
      },
    });
    
    logger.error('Withdrawal processing failed:', error);
    throw error;
  }
};

/**
 * Analytics worker - processes analytics updates
 */
const startAnalyticsWorker = async () => {
  logger.info('Starting Analytics Worker...');
  
  await consumeQueue(QUEUES.ANALYTICS, async (data, message) => {
    try {
      const { type, data: analyticsData } = data;
      
      switch (type) {
        case 'UPDATE':
          await updateCampaignAnalytics(analyticsData);
          break;
          
        default:
          logger.warn('Unknown analytics task type:', type);
      }
    } catch (error) {
      logger.error('Analytics worker error:', error);
      throw error;
    }
  });
};

/**
 * Update campaign analytics
 */
const updateCampaignAnalytics = async (data) => {
  const { campaignId, eventType, metrics } = data;
  
  try {
    await prisma.campaignAnalytics.update({
      where: { campaignId },
      data: {
        ...metrics,
        lastCalculatedAt: new Date(),
      },
    });
    
    logger.info('Campaign analytics updated', { campaignId, eventType });
  } catch (error) {
    logger.error('Error updating campaign analytics:', error);
    throw error;
  }
};

/**
 * Logic to confirm a booking, generate tickets, and update finances.
 */
const confirmBookingAndFinalize = async (bookingId, paymentId) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get booking and payment details
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { campaign: true, customer: true },
      });
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });

      if (!booking || !payment) {
        logger.warn('Booking or payment not found', { bookingId, paymentId });
        return null;
      }

      if (booking.status === 'CONFIRMED') {
        logger.warn('Booking already confirmed, skipping finalization.', { bookingId });
        return null;
      }

      // 1. Update booking status
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // 2. Generate tickets
      const tickets = [];
      const ticketCount = booking.issuanceType === 'SINGLE' ? 1 : booking.quantity;
      for (let i = 0; i < ticketCount; i++) {
        const ticket = await tx.ticket.create({
          data: {
            ticketNumber: generateUniqueId('TKT'),
            bookingId,
            campaignId: booking.campaignId,
            customerId: booking.customerId,
            ticketType: booking.ticketType,
            qrCode: '',
            qrSecurityKey: generateSecureToken(16), // NOW THIS WORKS
            status: 'VALID',
            maxScans: booking.campaign.isMultiScan ? booking.campaign.maxScansPerTicket : 1,
            validFrom: booking.campaign.startDate,
            validUntil: booking.campaign.endDate,
          },
        });
        tickets.push(ticket);
      }

      // 3. Update campaign analytics
      await tx.campaignAnalytics.update({
        where: { campaignId: booking.campaignId },
        data: {
          completedBookings: { increment: 1 },
          totalRevenue: { increment: booking.totalAmount },
        },
      });

      // 4. Update seller's finance
      const finance = await tx.finance.findUnique({ where: { sellerId: booking.campaign.sellerId } });
      if (finance) {
        const newPendingBalance = Number(finance.pendingBalance) + Number(booking.totalAmount);
        await tx.finance.update({
          where: { id: finance.id },
          data: {
            pendingBalance: { increment: booking.totalAmount },
            totalEarnings: { increment: booking.totalAmount },
          },
        });
        
        // 5. Create transaction record
        await tx.transaction.create({
          data: {
            financeId: finance.id,
            userId: booking.campaign.sellerId,
            paymentId,
            type: 'SALE',
            amount: booking.totalAmount,
            balanceBefore: finance.pendingBalance,
            balanceAfter: newPendingBalance,
            reference: booking.bookingRef,
            description: `Ticket sale for ${booking.campaign.title}`,
          },
        });
      }

      return { booking: updatedBooking, tickets, customer: booking.customer, campaign: booking.campaign };
    });

    if (!result) return;

    // 6. Queue post-confirmation tasks (outside the transaction)
    for (const ticket of result.tickets) {
      await rabbitmq.pdfQueue.generateTicket({ ticketId: ticket.id });
    }

    await rabbitmq.emailQueue.sendBookingConfirmation({
      bookingId,
      customerEmail: result.customer.email,
      customerName: `${result.customer.firstName} ${result.customer.lastName}`,
      bookingRef: result.booking.bookingRef,
      eventTitle: result.campaign.title,
      eventDate: result.campaign.eventDate,
      ticketCount: result.tickets.length,
    });

    logger.info('Booking confirmed and finalized successfully', { bookingId, paymentId });
  } catch (error) {
    logger.error('Error in confirmBookingAndFinalize:', error);
    throw error;
  }
};

/**
 * Start all workers
 */
export const startAllWorkers = async () => {
  try {
    await rabbitmq.connect();
    
    await Promise.all([
      startEmailWorker(),
      startPDFWorker(),
      startPaymentWorker(),
      startFinanceWorker(),
      startAnalyticsWorker(),
      startBookingWorker(),
    ]);
    
    logger.info('🚀 All background workers started successfully');
  } catch (error) {
    logger.error('Failed to start workers:', error);
    throw error;
  }
};

/**
 * Graceful shutdown of all workers
 */
export const stopAllWorkers = async () => {
  try {
    await rabbitmq.disconnect();
    logger.info('All workers stopped successfully');
  } catch (error) {
    logger.error('Error stopping workers:', error);
    throw error;
  }
};

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down workers...');
  await stopAllWorkers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down workers...');
  await stopAllWorkers();
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  startAllWorkers().catch(error => {
    logger.error('Failed to start workers:', error);
    process.exit(1);
  });
}