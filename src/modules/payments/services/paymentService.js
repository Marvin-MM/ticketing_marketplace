import prisma from '../../../config/database.js';
import { bookingQueue } from '../../../config/rabbitmq.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import { NotFoundError, PaymentError } from '../../../shared/errors/AppError.js';
import pesapalProvider from '../providers/pesapal.provider.js'; // Import our new provider

class PaymentService {
  async initializePayment(bookingId, userId, options = {}) {
    const { currency = 'UGX' } = options;

    const booking = await this._validateBookingForPayment(bookingId, userId);
    const existingPayment = await this._getExistingPayment(bookingId);
    if (existingPayment) {
      return this._handleExistingPayment(existingPayment);
    }

    const transactionRef = generateUniqueId('PAY'); // This is our Merchant Reference

    try {
      // 1. Build the Pesapal-specific payload
      const payload = {
        id: transactionRef,
        currency: currency.toUpperCase(),
        amount: Number(booking.totalAmount),
        description: `Payment for ${booking.campaign.title}`,
        callback_url: `${config.app.frontendUrl}/payment/callback`, // User is redirected here
        billing_address: {
          email_address: booking.customer.email,
          phone_number: booking.customer.phone || '',
          country_code: 'UG',
          first_name: booking.customer.firstName,
          last_name: booking.customer.lastName,
        },
      };

      // 2. Submit the order to Pesapal
      const pesapalResponse = await pesapalProvider.submitOrderRequest(payload);
      if (!pesapalResponse.redirect_url) {
        throw new PaymentError('Failed to get payment link from provider');
      }

      // 3. Create our internal payment record
      const payment = await prisma.payment.create({
        data: {
          bookingId,
          customerId: userId,
          transactionRef, // Our internal ID is Pesapal's merchant_reference
          provider: 'PESAPAL',
          providerRef: pesapalResponse.redirect_url, // The payment link
          providerTrackingId: pesapalResponse.order_tracking_id,
          amount: booking.totalAmount,
          currency,
          status: 'PENDING',
          paymentMethod: 'PESAPAL',
          paymentDetails: { pesapalResponse },
        },
      });

      logger.info('Pesapal payment initialized successfully', { paymentId: payment.id, bookingId });

      return {
        payment,
        paymentLink: pesapalResponse.redirect_url,
      };
    } catch (error) {
      logger.error('Pesapal payment initialization failed:', { bookingId, error: error.message });
      throw error;
    }
  }

  async processWebhook(webhookData) {
    const { OrderTrackingId, OrderMerchantReference } = webhookData;
    if (!OrderTrackingId || !OrderMerchantReference) {
      throw new PaymentError('Invalid Pesapal IPN data received');
    }

    const payment = await prisma.payment.findUnique({
      where: { transactionRef: OrderMerchantReference },
    });

    if (!payment) {
      logger.warn('IPN received for unknown transactionRef', { OrderMerchantReference });
      throw new NotFoundError('Payment');
    }

    if (payment.status === 'SUCCESS') {
      logger.info('IPN received for already successful payment, ignoring.', { paymentId: payment.id });
      return { status: 'success', message: 'Already processed' };
    }

    // Crucial step: Verify the transaction status with Pesapal's server directly
    const statusResult = await pesapalProvider.getTransactionStatus(OrderTrackingId);

    if (statusResult.payment_status_description === 'Completed') {
      await this._processSuccessfulPayment(payment, statusResult);
      return { status: 'success', message: 'Payment processed' };
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: statusResult.payment_status_description || 'Verification failed',
          webhookData: statusResult,
        },
      });
      logger.warn('Payment failed verification via IPN', { paymentId: payment.id, status: statusResult.payment_status_description });
      return { status: 'success', message: 'Payment failed' };
    }
  }

  async _processSuccessfulPayment(payment, verificationData) {
    // This function remains largely the same! It just updates the payment and publishes the event.
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        paymentMethod: verificationData.payment_method,
        paymentDetails: { ...payment.paymentDetails, verificationData },
        webhookData: verificationData,
      },
    });

    logger.info('Payment status updated to SUCCESS', { paymentId: updatedPayment.id });

    // Publish event for the booking worker to handle confirmation
    await bookingQueue.confirmBooking(payment.bookingId, payment.id);
  }

  _isPaymentVerified(verification, payment, webhookData) {
    return (
      verification.status === 'success' &&
      verification.data.status === 'successful' &&
      Number(verification.data.amount) === Number(payment.amount) &&
      verification.data.currency.toUpperCase() === payment.currency.toUpperCase()
    );
  }

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

    if (booking.paymentDeadline && new Date() > booking.paymentDeadline) {
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
      // --- FIX HERE ---
      // Use providerRef which stores the Pesapal redirect URL
      const paymentLink = payment.providerRef;

      if (paymentLink) {
        return {
          payment,
          paymentLink: paymentLink,
          existing: true
        };
      }
    }
    // For failed payments, allow retry by returning null
    return null;
  }

  async _calculatePaymentDetails(booking, currency, installments) {
    const baseAmount = Number(booking.totalAmount);
    
    const processingFeeRate = config.payment.processingFeeRate || 0.029;
    const processingFee = baseAmount * processingFeeRate;
    
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

  async _queuePaymentMonitoring(paymentId, transactionRef) {
    await paymentQueue.monitorPayment({
      paymentId,
      transactionRef,
      checkAfter: config.payment.timeoutMinutes * 60 * 1000
    });
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

      logger.info('Payment marked as failed', {
        paymentId: payment.id,
        reason: data.processor_response
      });
    }

    return { status: 'success', message: 'Failed payment processed' };
  }
}

export default new PaymentService(); 