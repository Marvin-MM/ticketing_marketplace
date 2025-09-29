import Flutterwave from 'flutterwave-node-v3';
import crypto from 'crypto';
import prisma from '../../../config/database.js';
import { cache } from '../../../config/redis.js';
import { emailQueue, paymentQueue } from '../../../config/rabbitmq.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import { 
  ValidationError, 
  NotFoundError, 
  PaymentError 
} from '../../../shared/errors/AppError.js';

// Initialize Flutterwave
const flw = new Flutterwave(
  config.flutterwave.publicKey,
  config.flutterwave.secretKey
);

/**
 * Enhanced Payment Service with comprehensive payment processing
 */
class PaymentService {
  /**
   * Initialize payment with retry logic and enhanced validation
   */
  async initializePayment(bookingId, userId, options = {}) {
    const {
      currency = 'USD',
      paymentMethod = 'card',
      installments = 1,
      metadata = {}
    } = options;

    // Get booking with comprehensive validation
    const booking = await this._validateBookingForPayment(bookingId, userId);
    
    // Check for existing payment
    const existingPayment = await this._getExistingPayment(bookingId);
    if (existingPayment) {
      return this._handleExistingPayment(existingPayment);
    }

    // Generate transaction reference
    const transactionRef = generateUniqueId('PAY');

    try {
      // Calculate payment details
      const paymentDetails = await this._calculatePaymentDetails(booking, currency, installments);
      
      // Create payment payload for Flutterwave
      const payload = await this._buildPaymentPayload(
        booking,
        transactionRef,
        paymentDetails,
        currency,
        paymentMethod,
        metadata
      );

      // Initialize payment with Flutterwave
      const response = await flw.Payment.initialize(payload);

      if (response.status !== 'success') {
        throw new PaymentError('Failed to initialize payment with provider');
      }

      // Create payment record
      const payment = await this._createPaymentRecord({
        bookingId,
        userId,
        transactionRef,
        flutterwaveRef: response.data.link,
        amount: paymentDetails.totalAmount,
        currency,
        paymentMethod,
        installments,
        metadata: {
          ...metadata,
          flutterwaveData: response.data,
          paymentDetails
        }
      });

      // Queue payment monitoring
      await this._queuePaymentMonitoring(payment.id, transactionRef);

      logger.info('Payment initialized successfully', {
        paymentId: payment.id,
        bookingId,
        transactionRef,
        amount: paymentDetails.totalAmount
      });

      return {
        payment,
        paymentLink: response.data.link,
        paymentDetails
      };

    } catch (error) {
      logger.error('Payment initialization failed:', {
        bookingId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process payment webhook with enhanced security and validation
   */
  async processWebhook(webhookData, signature, sourceIP) {
    // Enhanced webhook security validation
    await this._validateWebhookSecurity(webhookData, signature, sourceIP);

    const { event, data } = webhookData;

    try {
      switch (event) {
        case 'charge.completed':
          if (data.status === 'successful') {
            return await this._handleSuccessfulPayment(data);
          }
          break;
        
        case 'charge.failed':
          return await this._handleFailedPayment(data);
        
        case 'charge.disputed':
          return await this._handleDisputedPayment(data);
        
        case 'refund.successful':
          return await this._handleRefundCompleted(data);
        
        default:
          logger.info('Unhandled webhook event', { event });
      }

      return { status: 'success', message: 'Webhook processed' };
    } catch (error) {
      logger.error('Webhook processing failed:', {
        event,
        txRef: data.tx_ref,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retry failed payment with exponential backoff
   */
  async retryPayment(paymentId, retryOptions = {}) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            campaign: true,
            customer: true
          }
        }
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    if (payment.status === 'SUCCESS') {
      throw new PaymentError('Payment already successful');
    }

    // Check retry limits
    if (payment.retryCount >= config.payment.maxRetries) {
      throw new PaymentError('Maximum retry attempts exceeded');
    }

    // Calculate retry delay (exponential backoff)
    const retryDelay = Math.min(
      config.payment.baseRetryDelay * Math.pow(2, payment.retryCount),
      config.payment.maxRetryDelay
    );

    try {
      // Update retry count and schedule
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date()
        }
      });

      // Queue payment retry after delay
      await paymentQueue.retryPayment({
        paymentId,
        retryCount: payment.retryCount + 1,
        delay: retryDelay,
        ...retryOptions
      });

      logger.info('Payment retry scheduled', {
        paymentId,
        retryCount: payment.retryCount + 1,
        delayMs: retryDelay
      });

      return {
        retryScheduled: true,
        retryCount: payment.retryCount + 1,
        nextRetryAt: new Date(Date.now() + retryDelay)
      };

    } catch (error) {
      logger.error('Payment retry failed:', {
        paymentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process refund with validation and tracking
   */
  async processRefund(paymentId, refundData) {
    const { amount, reason, refundMethod = 'original' } = refundData;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            campaign: true,
            customer: true
          }
        }
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // Validate refund eligibility
    await this._validateRefundEligibility(payment, amount, reason);

    try {
      // Calculate refund details
      const refundDetails = await this._calculateRefundDetails(payment, amount);

      // Process refund with Flutterwave
      const refundResult = await this._processFlutterwaveRefund(
        payment,
        refundDetails,
        reason
      );

      // Update payment and create refund record
      const refund = await this._createRefundRecord(
        payment,
        refundDetails,
        refundResult,
        reason
      );

      // Trigger post-refund processes
      await this._triggerPostRefundProcesses(payment, refund);

      logger.info('Refund processed successfully', {
        paymentId,
        refundAmount: refundDetails.refundAmount,
        refundId: refund.id
      });

      return refund;

    } catch (error) {
      logger.error('Refund processing failed:', {
        paymentId,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get payment analytics for a period
   */
  async getPaymentAnalytics(filters = {}) {
    const {
      startDate,
      endDate,
      sellerId,
      paymentMethod,
      currency = 'USD',
      groupBy = 'day'
    } = filters;

    const cacheKey = `payment_analytics:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const whereClause = this._buildAnalyticsWhereClause(filters);

      const [
        paymentSummary,
        paymentTrends,
        methodBreakdown,
        statusBreakdown,
        revenueAnalytics,
        failureAnalysis
      ] = await Promise.all([
        this._getPaymentSummary(whereClause),
        this._getPaymentTrends(whereClause, groupBy),
        this._getPaymentMethodBreakdown(whereClause),
        this._getPaymentStatusBreakdown(whereClause),
        this._getRevenueAnalytics(whereClause),
        this._getFailureAnalysis(whereClause)
      ]);

      const analytics = {
        summary: paymentSummary,
        trends: paymentTrends,
        breakdown: {
          byMethod: methodBreakdown,
          byStatus: statusBreakdown
        },
        revenue: revenueAnalytics,
        failures: failureAnalysis,
        filters,
        generatedAt: new Date()
      };

      // Cache for 15 minutes
      await cache.set(cacheKey, JSON.stringify(analytics), 900);

      return analytics;

    } catch (error) {
      logger.error('Payment analytics failed:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Reconcile payments with Flutterwave
   */
  async reconcilePayments(dateRange) {
    const { startDate, endDate } = dateRange;

    try {
      // Get local payments for the period
      const localPayments = await prisma.payment.findMany({
        where: {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: { in: ['SUCCESS', 'FAILED', 'PENDING'] }
        },
        include: {
          booking: {
            select: {
              bookingRef: true,
              totalAmount: true
            }
          }
        }
      });

      // Get Flutterwave transactions for the period
      const flwTransactions = await this._getFlutterwaveTransactions(startDate, endDate);

      // Compare and identify discrepancies
      const reconciliation = await this._comparePaymentRecords(localPayments, flwTransactions);

      // Create reconciliation report
      const reconciliationReport = await this._createReconciliationReport(reconciliation, dateRange);

      logger.info('Payment reconciliation completed', {
        period: dateRange,
        localCount: localPayments.length,
        flwCount: flwTransactions.length,
        discrepancies: reconciliation.discrepancies.length
      });

      return reconciliationReport;

    } catch (error) {
      logger.error('Payment reconciliation failed:', {
        dateRange,
        error: error.message
      });
      throw error;
    }
  }

  // Private helper methods
  async _validateBookingForPayment(bookingId, userId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        campaign: true,
        customer: true,
        payment: true
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.customerId !== userId) {
      throw new PaymentError('You can only pay for your own bookings');
    }

    if (booking.status !== 'PENDING') {
      throw new PaymentError('Booking is not pending payment');
    }

    if (new Date() > booking.paymentDeadline) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'EXPIRED' }
      });
      throw new PaymentError('Payment deadline has passed');
    }

    return booking;
  }

  async _getExistingPayment(bookingId) {
    return await prisma.payment.findUnique({
      where: { bookingId },
      include: {
        booking: {
          select: {
            bookingRef: true,
            totalAmount: true
          }
        }
      }
    });
  }

  async _handleExistingPayment(payment) {
    if (payment.status === 'SUCCESS') {
      throw new PaymentError('Payment already completed');
    }
    
    if (payment.status === 'PENDING') {
      return {
        payment,
        paymentLink: payment.flutterwaveRef,
        existing: true
      };
    }
    
    // For failed payments, allow retry
    return null;
  }

  async _calculatePaymentDetails(booking, currency, installments) {
    const baseAmount = Number(booking.totalAmount);
    
    // Add processing fee (configurable percentage)
    const processingFeeRate = config.payment.processingFeeRate || 0.029;
    const processingFee = baseAmount * processingFeeRate;
    
    // Calculate installment details if applicable
    const installmentAmount = installments > 1 ? 
      Math.ceil((baseAmount + processingFee) / installments * 100) / 100 : 
      baseAmount + processingFee;

    return {
      baseAmount,
      processingFee,
      totalAmount: baseAmount + processingFee,
      installmentAmount,
      installments,
      currency
    };
  }

  async _buildPaymentPayload(booking, transactionRef, paymentDetails, currency, paymentMethod, metadata) {
    return {
      tx_ref: transactionRef,
      amount: paymentDetails.totalAmount,
      currency: currency.toUpperCase(),
      redirect_url: `${config.app.url}/api/v1/payments/callback`,
      customer: {
        email: booking.customer.email,
        name: `${booking.customer.firstName} ${booking.customer.lastName}`,
        phone_number: booking.customer.phone || ''
      },
      customizations: {
        title: config.app.name,
        description: `Payment for ${booking.campaign.title}`,
        logo: `${config.app.url}/logo.png`
      },
      payment_options: paymentMethod === 'card' ? 'card' : 'card,banktransfer,mobilemoney',
      meta: {
        bookingId: booking.id,
        customerId: booking.customerId,
        campaignId: booking.campaignId,
        installments: paymentDetails.installments,
        ...metadata
      }
    };
  }

  async _createPaymentRecord(paymentData) {
    return await prisma.payment.create({
      data: {
        bookingId: paymentData.bookingId,
        customerId: paymentData.userId,
        transactionRef: paymentData.transactionRef,
        flutterwaveRef: paymentData.flutterwaveRef,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: 'PENDING',
        paymentMethod: paymentData.paymentMethod,
        paymentDetails: {
          installments: paymentData.installments,
          processingFee: paymentData.metadata.paymentDetails.processingFee
        },
        metadata: paymentData.metadata
      },
      include: {
        booking: {
          select: {
            bookingRef: true,
            campaign: {
              select: {
                title: true
              }
            }
          }
        }
      }
    });
  }

  async _queuePaymentMonitoring(paymentId, transactionRef) {
    // Queue payment timeout check
    await paymentQueue.monitorPayment({
      paymentId,
      transactionRef,
      checkAfter: config.payment.timeoutMinutes * 60 * 1000
    });
  }

  async _validateWebhookSecurity(webhookData, signature, sourceIP) {
    // Verify webhook signature
    if (!signature || signature !== config.flutterwave.webhookSecret) {
      logger.security('Invalid webhook signature', null, sourceIP);
      throw new PaymentError('Invalid webhook signature');
    }

    // Verify source IP (if configured)
    if (config.flutterwave.allowedWebhookIPs) {
      const allowedIPs = config.flutterwave.allowedWebhookIPs.split(',');
      if (!allowedIPs.includes(sourceIP)) {
        logger.security('Webhook from unauthorized IP', null, sourceIP);
        throw new PaymentError('Unauthorized webhook source');
      }
    }

    // Verify webhook data structure
    if (!webhookData.event || !webhookData.data) {
      throw new PaymentError('Invalid webhook data structure');
    }
  }

  async _handleSuccessfulPayment(data) {
    const payment = await prisma.payment.findUnique({
      where: { transactionRef: data.tx_ref },
      include: {
        booking: {
          include: {
            campaign: true,
            customer: true
          }
        }
      }
    });

    if (!payment) {
      logger.error('Payment not found for successful webhook', { txRef: data.tx_ref });
      return { status: 'error', message: 'Payment not found' };
    }

    // Verify transaction with Flutterwave
    const verification = await flw.Transaction.verify({ id: data.id });

    if (this._isPaymentVerified(verification, payment, data)) {
      await this._processSuccessfulPayment(payment, data, verification.data);
      return { status: 'success', message: 'Payment processed' };
    } else {
      await this._handleFailedVerification(payment, data, verification.data);
      return { status: 'success', message: 'Payment verification failed' };
    }
  }

  async _handleFailedPayment(data) {
    const payment = await prisma.payment.findUnique({
      where: { transactionRef: data.tx_ref }
    });

    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: data.processor_response || 'Payment failed',
          webhookData: data
        }
      });

      // Queue retry if eligible
      if (payment.retryCount < config.payment.maxRetries) {
        await this.retryPayment(payment.id);
      }
    }

    return { status: 'success', message: 'Failed payment processed' };
  }

  async _processSuccessfulPayment(payment, webhookData, verificationData) {
    await prisma.$transaction(async (tx) => {
      // Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          verifiedAt: new Date(),
          paymentMethod: webhookData.payment_type,
          paymentDetails: {
            ...payment.paymentDetails,
            flutterwaveId: webhookData.id,
            paymentType: webhookData.payment_type,
            processorResponse: webhookData.processor_response
          },
          webhookData
        }
      });

      // Confirm booking and generate tickets
      await this._confirmBookingAndGenerateTickets(tx, payment);

      // Update financial records
      await this._updateFinancialRecords(tx, payment);
    });

    // Trigger post-payment processes
    await this._triggerPostPaymentProcesses(payment);
  }

  // Additional helper methods would continue here...
  // For brevity, I'm showing the structure and key methods

  _isPaymentVerified(verification, payment, webhookData) {
    return (
      verification.status === 'success' &&
      verification.data.status === 'successful' &&
      verification.data.amount === Number(payment.amount) &&
      verification.data.currency === payment.currency
    );
  }

  async _getPaymentSummary(whereClause) {
    const summary = await prisma.payment.groupBy({
      by: [],
      where: whereClause,
      _count: { id: true },
      _sum: { amount: true }
    });

    const successfulPayments = await prisma.payment.groupBy({
      by: [],
      where: { ...whereClause, status: 'SUCCESS' },
      _count: { id: true },
      _sum: { amount: true }
    });

    return {
      totalPayments: summary[0]?._count.id || 0,
      totalAmount: summary[0]?._sum.amount || 0,
      successfulPayments: successfulPayments[0]?._count.id || 0,
      successfulAmount: successfulPayments[0]?._sum.amount || 0,
      successRate: summary[0]?._count.id ? 
        (successfulPayments[0]?._count.id / summary[0]._count.id * 100) : 0
    };
  }
}

export default new PaymentService();