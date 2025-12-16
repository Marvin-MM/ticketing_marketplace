import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import { bookingCounters, lock } from '../../../config/redis.js';
import { pdfQueue, emailQueue, paymentQueue } from '../../../config/rabbitmq.js';
import { 
  ValidationError, 
  NotFoundError, 
  BookingError,
  InventoryError 
} from '../../../shared/errors/AppError.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import config from '../../../config/index.js';
import bookingService from '../services/bookingService.js';
import bookingAnalyticsService from '../services/bookingAnalyticsService.js';

/**
 * Create a new booking using enhanced booking service
 */
export const createBooking = async (req, res) => {
  const userId = req.user.id;
  const bookingData = req.body;

  try {
    // Use enhanced booking service
    const booking = await bookingService.createBooking(userId, bookingData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'BOOKING_CREATED',
        entity: 'Booking',
        entityId: booking.id,
        metadata: {
          campaignId: bookingData.campaignId,
          ticketType: bookingData.ticketType,
          quantity: bookingData.quantity,
          totalAmount: booking.totalAmount,
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking,
        paymentRequired: true,
        paymentDeadline: booking.paymentDeadline,
      },
    });
  } catch (error) {
    logger.error('Booking creation failed:', { userId, bookingData, error: error.message });
    throw error;
  }
};

/**
 * Get user's bookings with enhanced filtering
 */
export const getUserBookings = async (req, res) => {
  const userId = req.user.id;
  const filters = req.query;

  try {
    const result = await bookingService.getUserBookings(userId, filters);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get user bookings failed:', { userId, filters, error: error.message });
    throw error;
  }
};

/**
 * Get booking by ID
 */
export const getBookingById = async (req, res) => {
  const { bookingId } = req.params;
  const customerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      campaign: true,
      customer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      payment: true,
      tickets: {
        include: {
          validations: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  });

  if (!booking) {
    throw new NotFoundError('Booking');
  }

  // Check ownership or admin access
  if (booking.customerId !== customerId && req.user.role !== 'SUPER_ADMIN') {
    throw new BookingError('You can only view your own bookings');
  }

  res.status(200).json({
    success: true,
    data: { booking },
  });
};

/**
 * Cancel booking
 */
export const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;
  const customerId = req.user.id;

  // Begin transaction
  const result = await prisma.$transaction(async (tx) => {
    // Get booking with lock
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        campaign: true,
        payment: true,
      },
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    // Verify ownership
    if (booking.customerId !== customerId) {
      throw new BookingError('You can only cancel your own bookings');
    }

    // Check if booking can be cancelled
    if (booking.status !== 'PENDING') {
      throw new BookingError('Only pending bookings can be cancelled');
    }

    // Check if payment has been made
    if (booking.payment && booking.payment.status === 'SUCCESS') {
      throw new BookingError('Cannot cancel paid bookings. Please request a refund instead.');
    }

    // Restore inventory
    const campaign = await tx.ticketCampaign.findUnique({
      where: { id: booking.campaignId },
    });

    const ticketTypes = campaign.ticketTypes;
    ticketTypes[booking.ticketType].sold -= booking.quantity;

    await tx.ticketCampaign.update({
      where: { id: booking.campaignId },
      data: {
        ticketTypes,
        soldQuantity: campaign.soldQuantity - booking.quantity,
      },
    });

    // Update booking status
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    // Update analytics
    await tx.campaignAnalytics.update({
      where: { campaignId: booking.campaignId },
      data: {
        cancelledBookings: { increment: 1 },
      },
    });

    return updatedBooking;
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: customerId,
      action: 'BOOKING_CANCELLED',
      entity: 'Booking',
      entityId: bookingId,
      metadata: { reason },
    },
  });

  logger.info('Booking cancelled', { bookingId, customerId, reason });

  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    data: { booking: result },
  });
};

/**
 * Confirm booking after successful payment
 */
// export const confirmBooking = async (req, res) => {
//   const { bookingId } = req.params;
//   const { paymentId } = req.body;

//   // Begin transaction
//   const result = await prisma.$transaction(async (tx) => {
//     // Get booking
//     const booking = await tx.booking.findUnique({
//       where: { id: bookingId },
//       include: {
//         campaign: true,
//         customer: true,
//       },
//     });

//     if (!booking) {
//       throw new NotFoundError('Booking');
//     }

//     // Verify payment
//     const payment = await tx.payment.findUnique({
//       where: { id: paymentId },
//     });

//     if (!payment || payment.bookingId !== bookingId) {
//       throw new BookingError('Invalid payment reference');
//     }

//     if (payment.status !== 'SUCCESS') {
//       throw new BookingError('Payment not successful');
//     }

//     // Update booking status
//     const updatedBooking = await tx.booking.update({
//       where: { id: bookingId },
//       data: {
//         status: 'CONFIRMED',
//         confirmedAt: new Date(),
//       },
//     });

//     // Generate tickets
//     const tickets = [];
//     const ticketCount = booking.issuanceType === 'SINGLE' ? 1 : booking.quantity;

//     for (let i = 0; i < ticketCount; i++) {
//       const ticketNumber = generateUniqueId('TKT');
//       const ticket = await tx.ticket.create({
//         data: {
//           ticketNumber,
//           bookingId,
//           campaignId: booking.campaignId,
//           customerId: booking.customerId,
//           ticketType: booking.ticketType,
//           qrCode: '', // Will be updated by PDF worker
//           qrSecurityKey: generateUniqueId('SEC'),
//           status: 'VALID',
//           maxScans: booking.campaign.isMultiScan ? booking.campaign.maxScansPerTicket : 1,
//           validFrom: new Date(),
//           validUntil: booking.campaign.eventDate,
//           metadata: {
//             eventTitle: booking.campaign.title,
//             eventDate: booking.campaign.eventDate,
//             venue: booking.campaign.venue,
//             ticketType: booking.ticketType,
//             quantity: booking.issuanceType === 'SINGLE' ? booking.quantity : 1,
//           },
//         },
//       });
//       tickets.push(ticket);
//     }

//     // Update analytics
//     await tx.campaignAnalytics.update({
//       where: { campaignId: booking.campaignId },
//       data: {
//         completedBookings: { increment: 1 },
//         totalRevenue: { increment: booking.totalAmount },
//       },
//     });

//     // Update seller's finance
//     const finance = await tx.finance.findUnique({
//       where: { sellerId: booking.campaign.sellerId },
//     });

//     if (finance) {
//       await tx.finance.update({
//         where: { id: finance.id },
//         data: {
//           pendingBalance: { increment: booking.totalAmount },
//           totalEarnings: { increment: booking.totalAmount },
//         },
//       });
//     }

//     // Create transaction record
//     await tx.transaction.create({
//       data: {
//         financeId: finance?.id,
//         userId: booking.campaign.sellerId,
//         paymentId,
//         type: 'SALE',
//         amount: booking.totalAmount,
//         balanceBefore: finance?.pendingBalance || 0,
//         balanceAfter: (finance?.pendingBalance || 0) + Number(booking.totalAmount),
//         reference: booking.bookingRef,
//         description: `Ticket sale for ${booking.campaign.title}`,
//       },
//     });

//     return { booking: updatedBooking, tickets };
//   });

//   // Queue PDF generation for each ticket
//   for (const ticket of result.tickets) {
//     await pdfQueue.generateTicket({
//       ticketId: ticket.id,
//       ticketNumber: ticket.ticketNumber,
//       bookingRef: result.booking.bookingRef,
//       customerName: `${result.booking.customer.firstName} ${result.booking.customer.lastName}`,
//       customerEmail: result.booking.customer.email,
//       eventDetails: {
//         title: result.booking.campaign.title,
//         date: result.booking.campaign.eventDate,
//         venue: result.booking.campaign.venue,
//         venueAddress: result.booking.campaign.venueAddress,
//         ticketType: result.booking.ticketType,
//       },
//     });
//   }

//   // Send confirmation email
//   await emailQueue.sendBookingConfirmation({
//     bookingId,
//     customerEmail: result.booking.customer.email,
//     customerName: `${result.booking.customer.firstName} ${result.booking.customer.lastName}`,
//     bookingRef: result.booking.bookingRef,
//     eventTitle: result.booking.campaign.title,
//     eventDate: result.booking.campaign.eventDate,
//     ticketCount: result.tickets.length,
//   });

//   // Decrement booking counter
//   await bookingCounters.decrement(result.booking.campaignId);

//   // Log audit event
//   await prisma.auditLog.create({
//     data: {
//       userId: result.booking.customerId,
//       action: 'BOOKING_CONFIRMED',
//       entity: 'Booking',
//       entityId: bookingId,
//       metadata: {
//         paymentId,
//         ticketCount: result.tickets.length,
//       },
//     },
//   });

//   logger.info('Booking confirmed', { 
//     bookingId, 
//     paymentId,
//     ticketCount: result.tickets.length 
//   });

//   res.status(200).json({
//     success: true,
//     message: 'Booking confirmed successfully',
//     data: {
//       booking: result.booking,
//       tickets: result.tickets,
//     },
//   });
// };

/**
 * Modify an existing booking
 */
export const modifyBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;
  const modifications = req.body;

  try {
    const result = await bookingService.modifyBooking(bookingId, userId, modifications);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'BOOKING_MODIFIED',
        entity: 'Booking',
        entityId: bookingId,
        metadata: modifications
      }
    });

    res.status(200).json({
      success: true,
      message: 'Booking modification initiated',
      data: result
    });
  } catch (error) {
    logger.error('Booking modification failed:', { bookingId, userId, modifications, error: error.message });
    throw error;
  }
};

/**
 * Request refund for a booking
 */
export const requestRefund = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;
  const refundData = req.body;

  try {
    const refundRequest = await bookingService.requestRefund(bookingId, userId, refundData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'REFUND_REQUESTED',
        entity: 'Booking',
        entityId: bookingId,
        metadata: { refundRequestId: refundRequest.id, amount: refundRequest.amount }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Refund request submitted successfully',
      data: refundRequest
    });
  } catch (error) {
    logger.error('Refund request failed:', { bookingId, userId, refundData, error: error.message });
    throw error;
  }
};

/**
 * Add to waitlist for sold-out events
 */
export const addToWaitlist = async (req, res) => {
  const userId = req.user.id;
  const { campaignId } = req.params;
  const waitlistData = req.body;

  try {
    const waitlistEntry = await bookingService.addToWaitlist(userId, campaignId, waitlistData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'WAITLIST_JOINED',
        entity: 'Campaign',
        entityId: campaignId,
        metadata: { waitlistEntryId: waitlistEntry.id, ticketType: waitlistData.ticketType }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Successfully added to waitlist',
      data: waitlistEntry
    });
  } catch (error) {
    logger.error('Add to waitlist failed:', { userId, campaignId, waitlistData, error: error.message });
    throw error;
  }
};

/**
 * Get enhanced booking analytics for campaign
 */
export const getEnhancedCampaignBookingAnalytics = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;
  const dateRange = req.query;

  try {
    const analytics = await bookingAnalyticsService.getCampaignBookingAnalytics(
      campaignId,
      sellerId,
      dateRange
    );

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Enhanced campaign analytics failed:', { campaignId, sellerId, error: error.message });
    throw error;
  }
};

/**
 * Get seller booking analytics across all campaigns
 */
export const getSellerBookingAnalytics = async (req, res) => {
  const sellerId = req.user.id;
  const dateRange = req.query;

  try {
    const analytics = await bookingAnalyticsService.getSellerBookingAnalytics(sellerId, dateRange);

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Seller booking analytics failed:', { sellerId, error: error.message });
    throw error;
  }
};

/**
 * Get platform booking analytics (Admin only)
 */
export const getPlatformBookingAnalytics = async (req, res) => {
  const dateRange = req.query;

  try {
    const analytics = await bookingAnalyticsService.getPlatformBookingAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Platform booking analytics failed:', { error: error.message });
    throw error;
  }
};

/**
 * Get real-time booking metrics
 */
export const getRealTimeBookingMetrics = async (req, res) => {
  try {
    const metrics = await bookingAnalyticsService.getRealTimeBookingMetrics();

    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Real-time booking metrics failed:', { error: error.message });
    throw error;
  }
};

/**
 * Enhanced cancel booking with refund options
 */
export const enhancedCancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;
  const cancellationData = req.body;

  try {
    const result = await bookingService.cancelBooking(bookingId, userId, cancellationData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'BOOKING_CANCELLED_ENHANCED',
        entity: 'Booking',
        entityId: bookingId,
        metadata: {
          reason: cancellationData.reason,
          refundRequested: cancellationData.requestRefund,
          refundAmount: result.refundAmount
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: result
    });
  } catch (error) {
    logger.error('Enhanced booking cancellation failed:', { bookingId, userId, error: error.message });
    throw error;
  }
};
/**
 * Get booking statistics for a campaign (Seller only)
 */
// export const getCampaignBookingStats = async (req, res) => {
//   const { campaignId } = req.params;
//   const sellerId = req.user.id;

//   // Verify campaign ownership
//   const campaign = await prisma.ticketCampaign.findUnique({
//     where: { id: campaignId },
//     select: { sellerId: true },
//   });

//   if (!campaign) {
//     throw new NotFoundError('Campaign');
//   }

//   if (campaign.sellerId !== sellerId) {
//     throw new BookingError('You can only view statistics for your own campaigns');
//   }

//   // Get booking statistics
//   const stats = await prisma.booking.groupBy({
//     by: ['status', 'ticketType'],
//     where: { campaignId },
//     _count: {
//       id: true,
//     },
//     _sum: {
//       quantity: true,
//       totalAmount: true,
//     },
//   });

//   // Get time-based statistics
//   const dailyBookings = await prisma.$queryRaw`
//     SELECT 
//       DATE(created_at) as date,
//       COUNT(*) as bookings,
//       SUM(quantity) as tickets,
//       SUM(total_amount) as revenue
//     FROM bookings
//     WHERE campaign_id = ${campaignId}
//       AND status = 'CONFIRMED'
//     GROUP BY DATE(created_at)
//     ORDER BY date DESC
//     LIMIT 30
//   `;

//   res.status(200).json({
//     success: true,
//     data: {
//       summary: stats,
//       dailyTrend: dailyBookings,
//     },
//   });
// };


export const getCampaignBookingStats = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;

  // 1. Validation & Authorization
  // Best Practice: Select only the absolute minimum fields needed for auth checks
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== sellerId) {
    throw new BookingError('You can only view statistics for your own campaigns');
  }

  // 2. Aggregation using Prisma Native API (Best for type safety)
  // This part of your code was mostly correct, just ensure the fields exist
  const stats = await prisma.booking.groupBy({
    by: ['status', 'ticketType'],
    where: { campaignId },
    _count: {
      id: true,
    },
    _sum: {
      quantity: true,
      totalAmount: true,
    },
  });

  // 3. Time-Series Data using Raw SQL (Corrected)
  // Best Practice: Use double quotes for specific columns to preserve case sensitivity in Postgres
  // Best Practice: Cast SUMs to INT or FLOAT to avoid BigInt serialization errors in JSON
  const dailyBookings = await prisma.$queryRaw`
    SELECT 
      DATE("createdAt") as date,
      COUNT(*)::int as bookings,
      SUM("quantity")::int as tickets,
      SUM("totalAmount")::int as revenue
    FROM "bookings"
    WHERE "campaignId" = ${campaignId}
      AND "status" = 'CONFIRMED'
    GROUP BY DATE("createdAt")
    ORDER BY date DESC
    LIMIT 30
  `;

  // 4. Response
  res.status(200).json({
    success: true,
    data: {
      summary: stats,
      dailyTrend: dailyBookings,
    },
  });
};