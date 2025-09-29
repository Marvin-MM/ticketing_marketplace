import Flutterwave from 'flutterwave-node-v3';
import crypto from 'crypto';
import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { 
  ValidationError, 
  NotFoundError, 
  PaymentError 
} from '../../../shared/errors/AppError.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import paymentService from '../services/paymentService.js';
import paymentAnalyticsService from '../services/paymentAnalyticsService.js';

// Initialize Flutterwave
const flw = new Flutterwave(
  config.flutterwave.publicKey,
  config.flutterwave.secretKey
);

/**
 * Initialize payment using enhanced payment service
 */
export const initializePayment = async (req, res) => {
  const { bookingId, currency, paymentMethod, installments, metadata } = req.body;
  const userId = req.user.id;

  try {
    const options = {
      currency: currency || 'USD',
      paymentMethod: paymentMethod || 'card',
      installments: installments || 1,
      metadata: metadata || {}
    };

    const result = await paymentService.initializePayment(bookingId, userId, options);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PAYMENT_INITIALIZED',
        entity: 'Payment',
        entityId: result.payment.id,
        metadata: {
          bookingId,
          amount: result.payment.amount,
          transactionRef: result.payment.transactionRef,
          paymentMethod: options.paymentMethod
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        paymentId: result.payment.id,
        paymentLink: result.paymentLink,
        reference: result.payment.transactionRef,
        amount: result.payment.amount,
        currency: result.payment.currency,
        paymentDetails: result.paymentDetails,
        existing: result.existing || false
      }
    });
  } catch (error) {
    logger.error('Payment initialization failed:', {
      bookingId,
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Handle Flutterwave webhook with enhanced security
 */
export const handleWebhook = async (req, res) => {
  const signature = req.headers['verif-hash'];
  const sourceIP = req.ip;
  
  try {
    const result = await paymentService.processWebhook(req.body, signature, sourceIP);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Webhook processing failed:', {
      signature: signature ? 'present' : 'missing',
      sourceIP,
      error: error.message
    });
    res.status(200).json({ status: 'success', message: 'Webhook received' });
  }
};

/**
 * Retry failed payment
 */
export const retryPayment = async (req, res) => {
  const { paymentId } = req.params;
  const retryOptions = req.body;
  
  try {
    const result = await paymentService.retryPayment(paymentId, retryOptions);
    
    res.status(200).json({
      success: true,
      message: 'Payment retry scheduled',
      data: result
    });
  } catch (error) {
    logger.error('Payment retry failed:', { paymentId, error: error.message });
    throw error;
  }
};

/**
 * Get payment analytics
 */
export const getPaymentAnalytics = async (req, res) => {
  const filters = req.query;
  
  try {
    const analytics = await paymentAnalyticsService.getPlatformPaymentAnalytics(filters);
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Payment analytics failed:', { filters, error: error.message });
    throw error;
  }
};

/**
 * Get seller payment analytics
 */
export const getSellerPaymentAnalytics = async (req, res) => {
  const sellerId = req.user.id;
  const filters = req.query;
  
  try {
    const analytics = await paymentAnalyticsService.getSellerPaymentAnalytics(sellerId, filters);
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Seller payment analytics failed:', { sellerId, filters, error: error.message });
    throw error;
  }
};

/**
 * Get real-time payment metrics
 */
export const getRealTimePaymentMetrics = async (req, res) => {
  try {
    const metrics = await paymentAnalyticsService.getRealTimePaymentMetrics();
    
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Real-time payment metrics failed:', { error: error.message });
    throw error;
  }
};

/**
 * Get payment method analytics
 */
export const getPaymentMethodAnalytics = async (req, res) => {
  const filters = req.query;
  
  try {
    const analytics = await paymentAnalyticsService.getPaymentMethodAnalytics(filters);
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Payment method analytics failed:', { filters, error: error.message });
    throw error;
  }
};

/**
 * Get revenue analytics
 */
export const getRevenueAnalytics = async (req, res) => {
  const filters = req.query;
  
  try {
    const analytics = await paymentAnalyticsService.getRevenueAnalytics(filters);
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Revenue analytics failed:', { filters, error: error.message });
    throw error;
  }
};

/**
 * Get financial KPIs
 */
export const getFinancialKPIs = async (req, res) => {
  const filters = req.query;
  
  try {
    const kpis = await paymentAnalyticsService.getFinancialKPIs(filters);
    
    res.status(200).json({
      success: true,
      data: kpis
    });
  } catch (error) {
    logger.error('Financial KPIs calculation failed:', { filters, error: error.message });
    throw error;
  }
};

/**
 * Enhanced refund processing
 */
export const processRefund = async (req, res) => {
  const { paymentId } = req.params;
  const refundData = req.body;
  
  try {
    const refund = await paymentService.processRefund(paymentId, refundData);
    
    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'REFUND_PROCESSED',
        entity: 'Payment',
        entityId: paymentId,
        metadata: {
          refundAmount: refund.amount,
          reason: refundData.reason
        }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: refund
    });
  } catch (error) {
    logger.error('Refund processing failed:', { paymentId, refundData, error: error.message });
    throw error;
  }
};

/**
 * Reconcile payments
 */
export const reconcilePayments = async (req, res) => {
  const { startDate, endDate } = req.body;
  
  try {
    const reconciliation = await paymentService.reconcilePayments({ startDate, endDate });
    
    res.status(200).json({
      success: true,
      message: 'Payment reconciliation completed',
      data: reconciliation
    });
  } catch (error) {
    logger.error('Payment reconciliation failed:', { startDate, endDate, error: error.message });
    throw error;
  }
};

// Keep existing webhook processing for backward compatibility
const _legacyHandleWebhook = async (req, res) => {
  const signature = req.headers['verif-hash'];
  
  // Verify webhook signature
  if (!signature || signature !== config.flutterwave.webhookSecret) {
    logger.security('Invalid webhook signature', null, req.ip, req.get('user-agent'));
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }

  const { event, data } = req.body;

  try {
    if (event === 'charge.completed' && data.status === 'successful') {
      // Get payment by transaction reference
      const payment = await prisma.payment.findUnique({
        where: { transactionRef: data.tx_ref },
        include: {
          booking: {
            include: {
              campaign: true,
              customer: true,
            },
          },
        },
      });

      if (!payment) {
        logger.error('Payment not found for webhook', { txRef: data.tx_ref });
        return res.status(404).json({ status: 'error', message: 'Payment not found' });
      }

      // Verify transaction with Flutterwave
      const verification = await flw.Transaction.verify({ id: data.id });

      if (
        verification.status === 'success' &&
        verification.data.status === 'successful' &&
        verification.data.amount === Number(payment.amount) &&
        verification.data.currency === payment.currency
      ) {
        // Begin transaction to update payment and confirm booking
        await prisma.$transaction(async (tx) => {
          // Update payment status
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESS',
              verifiedAt: new Date(),
              paymentMethod: data.payment_type,
              paymentDetails: {
                flutterwaveId: data.id,
                paymentType: data.payment_type,
                processorResponse: data.processor_response,
              },
              webhookData: data,
            },
          });

          // Confirm booking
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
            },
          });

          // Generate tickets
          const ticketCount = payment.booking.issuanceType === 'SINGLE' 
            ? 1 
            : payment.booking.quantity;

          for (let i = 0; i < ticketCount; i++) {
            await tx.ticket.create({
              data: {
                ticketNumber: generateUniqueId('TKT'),
                bookingId: payment.bookingId,
                campaignId: payment.booking.campaignId,
                customerId: payment.booking.customerId,
                ticketType: payment.booking.ticketType,
                qrCode: '', // Will be generated by worker
                qrSecurityKey: generateUniqueId('SEC'),
                status: 'VALID',
                maxScans: payment.booking.campaign.isMultiScan 
                  ? payment.booking.campaign.maxScansPerTicket 
                  : 1,
                validFrom: new Date(),
                validUntil: payment.booking.campaign.eventDate,
              },
            });
          }

          // Update campaign analytics
          await tx.campaignAnalytics.update({
            where: { campaignId: payment.booking.campaignId },
            data: {
              completedBookings: { increment: 1 },
              totalRevenue: { increment: payment.amount },
            },
          });

          // Update seller finance
          const finance = await tx.finance.findUnique({
            where: { sellerId: payment.booking.campaign.sellerId },
          });

          if (finance) {
            await tx.finance.update({
              where: { id: finance.id },
              data: {
                pendingBalance: { increment: payment.amount },
                totalEarnings: { increment: payment.amount },
              },
            });

            // Create transaction record
            await tx.transaction.create({
              data: {
                financeId: finance.id,
                userId: payment.booking.campaign.sellerId,
                paymentId: payment.id,
                type: 'SALE',
                amount: payment.amount,
                balanceBefore: finance.pendingBalance,
                balanceAfter: Number(finance.pendingBalance) + Number(payment.amount),
                reference: payment.transactionRef,
                description: `Ticket sale for ${payment.booking.campaign.title}`,
              },
            });
          }
        });

        // Queue ticket PDF generation and email notification
        // This would be handled by the booking confirmation endpoint
        
        logger.info('Payment webhook processed successfully', {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          amount: payment.amount,
        });

        res.status(200).json({ status: 'success' });
      } else {
        logger.error('Payment verification failed', {
          paymentId: payment.id,
          verification: verification.data,
        });

        // Update payment as failed
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: 'Verification failed',
            webhookData: data,
          },
        });

        res.status(200).json({ status: 'success' });
      }
    } else if (event === 'charge.failed') {
      // Handle failed payment
      const payment = await prisma.payment.findUnique({
        where: { transactionRef: data.tx_ref },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: data.processor_response || 'Payment failed',
            webhookData: data,
          },
        });
      }

      res.status(200).json({ status: 'success' });
    } else {
      res.status(200).json({ status: 'success' });
    }
  } catch (error) {
    logger.error('Webhook processing error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Verify payment status
 */
export const verifyPayment = async (req, res) => {
  const { reference } = req.params;

  const payment = await prisma.payment.findUnique({
    where: { transactionRef: reference },
    include: {
      booking: {
        select: {
          id: true,
          bookingRef: true,
          status: true,
        },
      },
    },
  });

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  // Verify with Flutterwave if payment is still pending
  if (payment.status === 'PENDING') {
    try {
      const verification = await flw.Transaction.verify({ id: payment.flutterwaveRef });
      
      if (verification.status === 'success' && verification.data.status === 'successful') {
        // Update payment status
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            verifiedAt: new Date(),
          },
        });

        payment.status = 'SUCCESS';
      }
    } catch (error) {
      logger.error('Payment verification error:', error);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      payment: {
        id: payment.id,
        reference: payment.transactionRef,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        booking: payment.booking,
      },
    },
  });
};

/**
 * Get payment history for a user
 */
export const getPaymentHistory = async (req, res) => {
  const customerId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  const skip = (page - 1) * limit;

  const where = {
    customerId,
    ...(status && { status }),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            bookingRef: true,
            campaign: {
              select: {
                title: true,
                eventDate: true,
              },
            },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

/**
 * Request refund for a payment
 */
export const requestRefund = async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;
  const customerId = req.user.id;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          campaign: true,
        },
      },
    },
  });

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  // Verify ownership
  if (payment.customerId !== customerId) {
    throw new PaymentError('You can only request refund for your own payments');
  }

  // Check payment status
  if (payment.status !== 'SUCCESS') {
    throw new PaymentError('Can only refund successful payments');
  }

  // Check if already refunded
  if (payment.status === 'REFUNDED') {
    throw new PaymentError('Payment already refunded');
  }

  // Check refund eligibility (e.g., 24 hours before event)
  const hoursUntilEvent = (payment.booking.campaign.eventDate - new Date()) / (1000 * 60 * 60);
  if (hoursUntilEvent < 24) {
    throw new PaymentError('Refunds not allowed within 24 hours of the event');
  }

  try {
    // Process refund with Flutterwave
    const refundPayload = {
      id: payment.flutterwaveRef,
      amount: Number(payment.amount),
      comments: reason,
    };

    const refundResponse = await flw.Transaction.refund(refundPayload);

    if (refundResponse.status === 'success') {
      // Update payment and booking status
      await prisma.$transaction(async (tx) => {
        // Update payment
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'REFUNDED',
            updatedAt: new Date(),
          },
        });

        // Update booking
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: `Refund requested: ${reason}`,
          },
        });

        // Invalidate tickets
        await tx.ticket.updateMany({
          where: { bookingId: payment.bookingId },
          data: { status: 'CANCELLED' },
        });

        // Update seller finance
        const finance = await tx.finance.findUnique({
          where: { sellerId: payment.booking.campaign.sellerId },
        });

        if (finance) {
          await tx.finance.update({
            where: { id: finance.id },
            data: {
              pendingBalance: { decrement: payment.amount },
              totalEarnings: { decrement: payment.amount },
            },
          });

          // Create refund transaction
          await tx.transaction.create({
            data: {
              financeId: finance.id,
              userId: payment.booking.campaign.sellerId,
              paymentId: payment.id,
              type: 'REFUND',
              amount: payment.amount,
              balanceBefore: finance.pendingBalance,
              balanceAfter: Number(finance.pendingBalance) - Number(payment.amount),
              reference: `REF-${payment.transactionRef}`,
              description: `Refund for ${payment.booking.campaign.title}`,
            },
          });
        }

        // Restore inventory
        const ticketTypes = payment.booking.campaign.ticketTypes;
        ticketTypes[payment.booking.ticketType].sold -= payment.booking.quantity;

        await tx.ticketCampaign.update({
          where: { id: payment.booking.campaignId },
          data: {
            ticketTypes,
            soldQuantity: payment.booking.campaign.soldQuantity - payment.booking.quantity,
          },
        });
      });

      // Log audit event
      await prisma.auditLog.create({
        data: {
          userId: customerId,
          action: 'PAYMENT_REFUNDED',
          entity: 'Payment',
          entityId: paymentId,
          metadata: { reason },
        },
      });

      logger.info('Refund processed', { paymentId, customerId, amount: payment.amount });

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          paymentId,
          refundStatus: 'SUCCESS',
        },
      });
    } else {
      throw new PaymentError('Refund processing failed');
    }
  } catch (error) {
    logger.error('Refund error:', error);
    throw new PaymentError('Failed to process refund');
  }
};