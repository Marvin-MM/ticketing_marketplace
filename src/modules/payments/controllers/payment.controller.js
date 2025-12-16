import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { 
  NotFoundError, 
  PaymentError 
} from '../../../shared/errors/AppError.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import paymentService from '../services/paymentService.js';
import pesapalProvider from '../providers/pesapal.provider.js';
import paymentAnalyticsService from '../services/paymentAnalyticsService.js';

/**
 * Initialize payment using enhanced payment service
 */
export const initializePayment = async (req, res) => {
  const { bookingId, currency, paymentMethod, installments, metadata } = req.body;
  const userId = req.user.id;

  try {
    const options = {
      currency: currency || 'UGX',
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
 * Handle Pesapal webhook with enhanced security
 */
export const handleWebhook = async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;
  const sourceIP = req.ip;

  logger.info('Pesapal IPN received', { OrderTrackingId, OrderMerchantReference, sourceIP });

  if (!OrderTrackingId || !OrderMerchantReference) {
    logger.warn('Invalid IPN received from Pesapal', { query: req.query });
    // Still send 200 OK so Pesapal doesn't keep retrying
    return res.status(200).send(`pesapal_notification_id=${req.query.pesapal_notification_id}&pesapal_tracking_id=${OrderTrackingId}&pesapal_merchant_reference=${OrderMerchantReference}&status=COMPLETED`);
  }

  try {
    // Pass the query data to the service for processing
    await paymentService.processWebhook(req.query);
  } catch (error) {
    logger.error('Webhook processing failed:', {
      OrderTrackingId,
      error: error.message
    });
    // We catch errors but still respond with success to Pesapal
  }

  // Pesapal requires a specific response format to acknowledge the IPN
  const responseText = `pesapal_notification_id=${req.query.pesapal_notification_id}&pesapal_tracking_id=${OrderTrackingId}&pesapal_merchant_reference=${OrderMerchantReference}&status=COMPLETED`;
  res.status(200).send(responseText);
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


/**
 * Verify payment status
 */
export const verifyPayment = async (req, res) => {
  const { reference } = req.params; // This is our internal transactionRef (Pesapal's OrderMerchantReference)

  const payment = await prisma.payment.findUnique({
    where: { transactionRef: reference },
    include: {
      booking: { // Include booking details relevant to the frontend
        select: {
          id: true,
          bookingRef: true,
          status: true,
          campaign: {
            select: {
              title: true,
              eventDate: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  // If the payment status is already resolved (SUCCESS or FAILED) in our database,
  // return that status directly. No need to check Pesapal again.
  if (payment.status !== 'PENDING') {
    return res.status(200).json({
      success: true,
      message: `Payment status already ${payment.status}.`,
      data: {
        payment: { // Return a subset of payment and booking details
          id: payment.id,
          reference: payment.transactionRef,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          booking: payment.booking,
        },
      },
    });
  }

  // If the status is PENDING in our DB, we must verify the latest status with Pesapal.
  // We need the providerTrackingId (Pesapal's OrderTrackingId) for this.
  if (payment.providerTrackingId) {
    try {
      logger.info('Verifying PENDING payment status with Pesapal', { reference, trackingId: payment.providerTrackingId });
      const statusResult = await pesapalProvider.getTransactionStatus(payment.providerTrackingId);
      logger.info('Pesapal status verification result', { reference, statusResult });

      // Check Pesapal's authoritative status
      if (statusResult.payment_status_description === 'Completed') {
        // Payment is COMPLETED according to Pesapal. Update our record as SUCCESS.
        // This is a crucial fallback in case the webhook (IPN) was missed or delayed.
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            verifiedAt: new Date(),
            paymentMethod: statusResult.payment_method, // Capture the method used
            webhookData: statusResult, // Store the verification result
            paymentDetails: { ...payment.paymentDetails, verificationData: statusResult }, // Append verification data
          },
        });
        payment.status = 'SUCCESS'; // Update status for the response object
        logger.info('Payment status confirmed as SUCCESS via direct verification', { paymentId: payment.id, reference });

      } else if (['Failed', 'Cancelled', 'Invalid'].includes(statusResult.payment_status_description)) {
        // Payment FAILED according to Pesapal. Update our record.
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: statusResult.payment_status_description || 'Verification indicated failure',
            webhookData: statusResult,
            paymentDetails: { ...payment.paymentDetails, verificationData: statusResult },
          },
        });
        payment.status = 'FAILED'; // Update status for the response object
        logger.warn('Payment status confirmed as FAILED via direct verification', { paymentId: payment.id, reference, reason: statusResult.payment_status_description });

      }
      // If Pesapal still reports PENDING ('Pending' status description), we do nothing here.
      // Our database record remains PENDING, and the frontend will reflect that.
      // The webhook (IPN) should eventually update it, or the user might retry verification later.

    } catch (error) {
      logger.error('Pesapal status verification failed during verifyPayment:', { reference, trackingId: payment.providerTrackingId, error: error.message });
      // Don't throw an error to the client. Just log it and return the current PENDING status from our DB.
      // The frontend should handle the PENDING status appropriately (e.g., asking the user to wait or check again).
    }
  } else {
    // This case should ideally not happen if initialization worked correctly,
    // but handle it defensively.
    logger.warn('Cannot verify payment with Pesapal: providerTrackingId is missing.', { paymentId: payment.id, reference });
  }

  // Return the current status (which might have been updated above)
  res.status(200).json({
    success: true,
    message: `Current payment status: ${payment.status}`,
    data: {
      payment: { // Return consistent subset of data
        id: payment.id,
        reference: payment.transactionRef,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status, // Return the potentially updated status
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