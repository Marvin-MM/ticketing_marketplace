import prisma from '../../../config/database.js';
import { cache, bookingCounters, lock } from '../../../config/redis.js';
import { pdfQueue, emailQueue, paymentQueue } from '../../../config/rabbitmq.js';
import logger from '../../../config/logger.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import { 
  ValidationError, 
  NotFoundError, 
  BookingError,
  InventoryError 
} from '../../../shared/errors/AppError.js';

/**
 * Enhanced Booking Service with comprehensive business logic
 */
class BookingService {
  /**
   * Create a booking with advanced inventory management
   */
  async createBooking(userId, bookingData) {
    const { campaignId, ticketType, quantity, issuanceType, promoCode, groupBookingInfo } = bookingData;

    // Validate basic constraints
    if (quantity < 1 || quantity > 20) {
      throw new ValidationError('Quantity must be between 1 and 20');
    }

    if (!['SINGLE', 'SEPARATE'].includes(issuanceType)) {
      throw new ValidationError('Invalid issuance type. Must be SINGLE or SEPARATE');
    }

    // Acquire distributed lock
    const lockKey = `booking:lock:${campaignId}:${ticketType}`;
    const lockToken = await lock.acquire(lockKey, 10);

    if (!lockToken) {
      throw new BookingError('System is busy. Please try again.');
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        // Get campaign with all necessary data
        const campaign = await tx.ticketCampaign.findUnique({
          where: { id: campaignId },
          include: {
            seller: {
              include: { sellerApplication: true }
            }
          }
        });

        if (!campaign) {
          throw new NotFoundError('Campaign');
        }

        // Validate campaign availability
        await this._validateCampaignBookability(campaign);

        // Validate ticket type and check inventory
        const ticketTypeInfo = await this._validateTicketType(campaign, ticketType, quantity);

        // Check customer booking limits
        await this._checkCustomerBookingLimits(tx, userId, campaignId, quantity, campaign.maxPerCustomer);

        // Apply promo code if provided
        const discountInfo = promoCode ? await this._applyPromoCode(tx, promoCode, campaignId, userId) : null;

        // Calculate final pricing
        const pricingInfo = await this._calculateBookingPrice(ticketTypeInfo, quantity, discountInfo);

        // Create booking record
        const booking = await this._createBookingRecord(tx, {
          userId,
          campaignId,
          ticketType,
          quantity,
          issuanceType,
          pricingInfo,
          discountInfo,
          groupBookingInfo,
          campaign
        });

        // Update inventory
        await this._updateInventory(tx, campaign, ticketType, quantity);

        // Update analytics
        await this._updateBookingAnalytics(tx, campaignId, booking);

        return booking;
      });

      // Release lock
      await lock.release(lockKey, lockToken);

      // Trigger post-booking processes
      await this._triggerPostBookingProcesses(booking, userId);

      return booking;
    } catch (error) {
      // Cleanup on error
      if (lockToken) {
        await lock.release(lockKey, lockToken);
      }
      await bookingCounters.decrement(campaignId);
      throw error;
    }
  }

  /**
   * Get user bookings with advanced filtering
   */
  async getUserBookings(userId, filters = {}) {
    const { status, eventType, dateFrom, dateTo, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = {
      customerId: userId,
      ...(status && { status }),
    };

    // Add campaign filters if provided
    if (eventType || dateFrom || dateTo) {
      where.campaign = {};
      if (eventType) {
        where.campaign.eventType = eventType;
      }
      if (dateFrom || dateTo) {
        where.campaign.eventDate = {};
        if (dateFrom) {
          where.campaign.eventDate.gte = new Date(dateFrom);
        }
        if (dateTo) {
          where.campaign.eventDate.lte = new Date(dateTo);
        }
      }
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: {
            select: {
              title: true,
              eventDate: true,
              venue: true,
              venueCity: true,
              coverImage: true,
              eventType: true
            }
          },
          payment: {
            select: {
              status: true,
              paymentMethod: true,
              amount: true,
              currency: true
            }
          },
          tickets: {
            select: {
              id: true,
              ticketNumber: true,
              status: true,
              pdfUrl: true,
              scanCount: true,
              maxScans: true
            }
          }
        }
      }),
      prisma.booking.count({ where })
    ]);

    // Enhance booking data
    const enhancedBookings = bookings.map(booking => ({
      ...booking,
      canCancel: this._canCancelBooking(booking),
      canModify: this._canModifyBooking(booking),
      needsPayment: booking.status === 'PENDING' && new Date() < booking.paymentDeadline,
      isExpired: booking.status === 'PENDING' && new Date() > booking.paymentDeadline,
      ticketsSummary: {
        total: booking.tickets.length,
        valid: booking.tickets.filter(t => t.status === 'VALID').length,
        used: booking.tickets.filter(t => t.status === 'USED').length
      }
    }));

    return {
      bookings: enhancedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Modify an existing booking
   */
  async modifyBooking(bookingId, userId, modifications) {
    const { newTicketType, newQuantity, reason } = modifications;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        campaign: true,
        payment: true
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.customerId !== userId) {
      throw new BookingError('You can only modify your own bookings');
    }

    if (!this._canModifyBooking(booking)) {
      throw new BookingError('This booking cannot be modified');
    }

    // Create modification request if paid booking
    if (booking.status === 'CONFIRMED') {
      return await this._createModificationRequest(booking, modifications, reason);
    }

    // Direct modification for pending bookings
    return await this._executeBookingModification(booking, modifications);
  }

  /**
   * Cancel booking with refund handling
   */
  async cancelBooking(bookingId, userId, cancellationData = {}) {
    const { reason, requestRefund = false } = cancellationData;

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          campaign: true,
          payment: true,
          tickets: true
        }
      });

      if (!booking) {
        throw new NotFoundError('Booking');
      }

      if (booking.customerId !== userId) {
        throw new BookingError('You can only cancel your own bookings');
      }

      // Validate cancellation policy
      await this._validateCancellationPolicy(booking);

      // Calculate refund amount if applicable
      const refundAmount = requestRefund ? await this._calculateRefundAmount(booking) : 0;

      // Update booking status
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          metadata: {
            ...booking.metadata,
            refundRequested: requestRefund,
            refundAmount: refundAmount
          }
        }
      });

      // Restore inventory
      await this._restoreInventory(tx, booking);

      // Update analytics
      await this._updateCancellationAnalytics(tx, booking);

      // Create refund request if needed
      if (requestRefund && refundAmount > 0) {
        await this._createRefundRequest(tx, booking, refundAmount, reason);
      }

      return { booking: updatedBooking, refundAmount };
    });

    // Trigger post-cancellation processes
    await this._triggerPostCancellationProcesses(result.booking, requestRefund);

    return result;
  }

  /**
   * Request refund for confirmed booking
   */
  async requestRefund(bookingId, userId, refundData) {
    const { reason, amount } = refundData;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        campaign: true,
        payment: true
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.customerId !== userId) {
      throw new BookingError('You can only request refunds for your own bookings');
    }

    if (booking.status !== 'CONFIRMED') {
      throw new BookingError('Only confirmed bookings can be refunded');
    }

    // Validate refund eligibility
    const maxRefundAmount = await this._calculateRefundAmount(booking);
    const requestAmount = amount || maxRefundAmount;

    if (requestAmount > maxRefundAmount) {
      throw new BookingError(`Maximum refundable amount is ${maxRefundAmount}`);
    }

    // Create refund request
    const refundRequest = await prisma.refundRequest.create({
      data: {
        bookingId,
        customerId: userId,
        amount: requestAmount,
        reason,
        status: 'PENDING',
        requestedAt: new Date()
      }
    });

    // Notify administrators
    await this._notifyRefundRequest(booking, refundRequest);

    logger.info('Refund requested', {
      bookingId,
      userId,
      amount: requestAmount,
      reason
    });

    return refundRequest;
  }

  /**
   * Add booking to waitlist for sold-out events
   */
  async addToWaitlist(userId, campaignId, waitlistData) {
    const { ticketType, quantity, notificationPreferences = {} } = waitlistData;

    // Check if campaign exists and is sold out
    const campaign = await prisma.ticketCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      throw new NotFoundError('Campaign');
    }

    const ticketTypeInfo = campaign.ticketTypes[ticketType];
    if (!ticketTypeInfo) {
      throw new ValidationError('Invalid ticket type');
    }

    const available = ticketTypeInfo.quantity - (ticketTypeInfo.sold || 0);
    if (available >= quantity) {
      throw new BookingError('Tickets are available for immediate booking');
    }

    // Check if user is already on waitlist
    const existingWaitlist = await prisma.waitlistEntry.findFirst({
      where: {
        userId,
        campaignId,
        ticketType,
        status: 'ACTIVE'
      }
    });

    if (existingWaitlist) {
      throw new BookingError('You are already on the waitlist for this ticket type');
    }

    // Create waitlist entry
    const waitlistEntry = await prisma.waitlistEntry.create({
      data: {
        userId,
        campaignId,
        ticketType,
        quantity,
        priority: await this._calculateWaitlistPriority(userId, campaignId),
        notificationPreferences,
        status: 'ACTIVE'
      }
    });

    logger.info('User added to waitlist', {
      userId,
      campaignId,
      ticketType,
      quantity
    });

    return waitlistEntry;
  }

  /**
   * Process waitlist when tickets become available
   */
  async processWaitlist(campaignId, ticketType, availableQuantity) {
    const waitlistEntries = await prisma.waitlistEntry.findMany({
      where: {
        campaignId,
        ticketType,
        status: 'ACTIVE'
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    let remainingQuantity = availableQuantity;
    const notifiedUsers = [];

    for (const entry of waitlistEntries) {
      if (remainingQuantity <= 0) break;

      if (entry.quantity <= remainingQuantity) {
        // Notify user about available tickets
        await this._notifyWaitlistUser(entry);
        
        // Mark as notified
        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: {
            status: 'NOTIFIED',
            notifiedAt: new Date(),
            reservationExpiry: new Date(Date.now() + 30 * 60 * 1000) // 30 min reservation
          }
        });

        remainingQuantity -= entry.quantity;
        notifiedUsers.push(entry.user);
      }
    }

    return {
      notifiedCount: notifiedUsers.length,
      remainingQuantity
    };
  }

  // Private helper methods
  async _validateCampaignBookability(campaign) {
    if (campaign.status !== 'ACTIVE') {
      throw new BookingError('Campaign is not active');
    }

    const now = new Date();
    if (now < campaign.startDate || now > campaign.endDate) {
      throw new BookingError('Campaign is not available for booking');
    }

    if (campaign.eventDate < now) {
      throw new BookingError('Event has already occurred');
    }
  }

  async _validateTicketType(campaign, ticketType, quantity) {
    const ticketTypes = campaign.ticketTypes;
    if (!ticketTypes[ticketType]) {
      throw new ValidationError('Invalid ticket type');
    }

    const ticketTypeInfo = ticketTypes[ticketType];
    const availableQuantity = ticketTypeInfo.quantity - (ticketTypeInfo.sold || 0);
    
    if (availableQuantity < quantity) {
      throw new InventoryError(`Only ${availableQuantity} tickets available for ${ticketType}`);
    }

    return ticketTypeInfo;
  }

  async _checkCustomerBookingLimits(tx, userId, campaignId, quantity, maxPerCustomer) {
    const existingBookings = await tx.booking.findMany({
      where: {
        customerId: userId,
        campaignId,
        status: { in: ['PENDING', 'CONFIRMED'] }
      }
    });

    const totalBooked = existingBookings.reduce((sum, b) => sum + b.quantity, 0);
    if (totalBooked + quantity > maxPerCustomer) {
      throw new BookingError(`Maximum ${maxPerCustomer} tickets allowed per customer`);
    }
  }

  async _applyPromoCode(tx, promoCode, campaignId, userId) {
    const promo = await tx.promoCode.findFirst({
      where: {
        code: promoCode.toUpperCase(),
        isActive: true,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
        OR: [
          { campaignId },
          { campaignId: null } // Global promo codes
        ]
      }
    });

    if (!promo) {
      throw new ValidationError('Invalid or expired promo code');
    }

    // Check usage limits
    const usageCount = await tx.promoCodeUsage.count({
      where: {
        promoCodeId: promo.id,
        userId
      }
    });

    if (usageCount >= promo.maxUsesPerUser) {
      throw new ValidationError('Promo code usage limit exceeded');
    }

    return promo;
  }

  async _calculateBookingPrice(ticketTypeInfo, quantity, discountInfo) {
    const unitPrice = ticketTypeInfo.price;
    const subtotal = unitPrice * quantity;
    
    let discountAmount = 0;
    if (discountInfo) {
      if (discountInfo.type === 'PERCENTAGE') {
        discountAmount = (subtotal * discountInfo.value) / 100;
      } else {
        discountAmount = Math.min(discountInfo.value, subtotal);
      }
    }

    const totalAmount = subtotal - discountAmount;

    return {
      unitPrice,
      subtotal,
      discountAmount,
      totalAmount
    };
  }

  async _createBookingRecord(tx, bookingData) {
    const {
      userId,
      campaignId,
      ticketType,
      quantity,
      issuanceType,
      pricingInfo,
      discountInfo,
      groupBookingInfo,
      campaign
    } = bookingData;

    const bookingRef = generateUniqueId('BKG');
    const paymentDeadline = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    return await tx.booking.create({
      data: {
        bookingRef,
        customerId: userId,
        campaignId,
        ticketType,
        quantity,
        unitPrice: pricingInfo.unitPrice,
        totalAmount: pricingInfo.totalAmount,
        issuanceType,
        paymentDeadline,
        status: 'PENDING',
        metadata: {
          subtotal: pricingInfo.subtotal,
          discountAmount: pricingInfo.discountAmount,
          promoCode: discountInfo?.code,
          groupBookingInfo,
          campaignTitle: campaign.title,
          eventDate: campaign.eventDate,
          venue: campaign.venue
        }
      },
      include: {
        campaign: {
          select: {
            title: true,
            eventDate: true,
            venue: true,
            venueAddress: true,
            venueCity: true
          }
        }
      }
    });
  }

  async _updateInventory(tx, campaign, ticketType, quantity) {
    const ticketTypes = { ...campaign.ticketTypes };
    ticketTypes[ticketType].sold = (ticketTypes[ticketType].sold || 0) + quantity;

    await tx.ticketCampaign.update({
      where: { id: campaign.id },
      data: {
        ticketTypes,
        soldQuantity: campaign.soldQuantity + quantity
      }
    });
  }

  async _updateBookingAnalytics(tx, campaignId, booking) {
    await tx.campaignAnalytics.update({
      where: { campaignId },
      data: {
        totalBookings: { increment: 1 },
        pendingBookings: { increment: 1 }
      }
    });

    await bookingCounters.increment(campaignId);
  }

  async _triggerPostBookingProcesses(booking, userId) {
    // Initialize payment
    await paymentQueue.processPayment({
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      customerId: userId,
      amount: booking.totalAmount,
      currency: 'USD'
    });

    // Send booking confirmation email
    await emailQueue.sendBookingCreated({
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      paymentDeadline: booking.paymentDeadline
    });

    logger.info('Booking created successfully', {
      bookingId: booking.id,
      customerId: userId,
      campaignId: booking.campaignId,
      quantity: booking.quantity
    });
  }

  _canCancelBooking(booking) {
    if (booking.status === 'CANCELLED') return false;
    if (booking.status === 'PENDING') return true;
    
    // Check cancellation policy for confirmed bookings
    const eventDate = new Date(booking.campaign.eventDate);
    const hoursUntilEvent = (eventDate - new Date()) / (1000 * 60 * 60);
    
    return hoursUntilEvent > 24; // Allow cancellation up to 24 hours before event
  }

  _canModifyBooking(booking) {
    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) return false;
    
    const eventDate = new Date(booking.campaign.eventDate);
    const hoursUntilEvent = (eventDate - new Date()) / (1000 * 60 * 60);
    
    return hoursUntilEvent > 48; // Allow modifications up to 48 hours before event
  }

  async _calculateRefundAmount(booking) {
    const campaign = booking.campaign;
    const eventDate = new Date(campaign.eventDate);
    const hoursUntilEvent = (eventDate - new Date()) / (1000 * 60 * 60);
    
    // Refund policy based on time until event
    let refundPercentage = 0;
    if (hoursUntilEvent > 168) { // 7 days
      refundPercentage = 100;
    } else if (hoursUntilEvent > 72) { // 3 days
      refundPercentage = 75;
    } else if (hoursUntilEvent > 24) { // 1 day
      refundPercentage = 50;
    }
    
    return (booking.totalAmount * refundPercentage) / 100;
  }

  async _restoreInventory(tx, booking) {
    const campaign = await tx.ticketCampaign.findUnique({
      where: { id: booking.campaignId }
    });

    const ticketTypes = { ...campaign.ticketTypes };
    ticketTypes[booking.ticketType].sold -= booking.quantity;

    await tx.ticketCampaign.update({
      where: { id: booking.campaignId },
      data: {
        ticketTypes,
        soldQuantity: campaign.soldQuantity - booking.quantity
      }
    });
  }

  async _updateCancellationAnalytics(tx, booking) {
    await tx.campaignAnalytics.update({
      where: { campaignId: booking.campaignId },
      data: {
        cancelledBookings: { increment: 1 },
        ...(booking.status === 'PENDING' && { pendingBookings: { decrement: 1 } })
      }
    });
  }

  async _createRefundRequest(tx, booking, refundAmount, reason) {
    return await tx.refundRequest.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        amount: refundAmount,
        reason,
        status: 'PENDING',
        requestedAt: new Date()
      }
    });
  }

  async _triggerPostCancellationProcesses(booking, requestRefund) {
    // Send cancellation email
    await emailQueue.sendBookingCancelled({
      bookingId: booking.id,
      refundRequested: requestRefund
    });

    // Process waitlist if applicable
    if (booking.campaign) {
      await this.processWaitlist(
        booking.campaignId,
        booking.ticketType,
        booking.quantity
      );
    }

    logger.info('Booking cancelled', {
      bookingId: booking.id,
      reason: booking.cancellationReason,
      refundRequested: requestRefund
    });
  }

  async _calculateWaitlistPriority(userId, campaignId) {
    // Implement priority calculation based on user tier, purchase history, etc.
    return 1; // Default priority
  }

  async _notifyWaitlistUser(entry) {
    await emailQueue.sendWaitlistNotification({
      userId: entry.userId,
      campaignId: entry.campaignId,
      ticketType: entry.ticketType,
      quantity: entry.quantity,
      reservationExpiry: entry.reservationExpiry
    });
  }

  async _notifyRefundRequest(booking, refundRequest) {
    // Notify administrators about refund request
    await emailQueue.sendRefundRequestNotification({
      bookingId: booking.id,
      refundRequestId: refundRequest.id,
      amount: refundRequest.amount
    });
  }
}

export default new BookingService();