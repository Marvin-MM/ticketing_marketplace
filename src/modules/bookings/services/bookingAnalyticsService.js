// import prisma from '../../../config/database.js';
// import { cache } from '../../../config/redis.js';
// import logger from '../../../config/logger.js';

// /**
//  * Booking Analytics Service for comprehensive booking insights
//  */
// class BookingAnalyticsService {
//   /**
//    * Get comprehensive booking analytics for a campaign
//    */
//   async getCampaignBookingAnalytics(campaignId, sellerId, dateRange = {}) {
//     const { startDate, endDate } = dateRange;
//     const cacheKey = `booking_analytics:${campaignId}:${startDate || 'all'}:${endDate || 'all'}`;
    
//     // Check cache first
//     const cached = await cache.get(cacheKey);
//     if (cached) {
//       return JSON.parse(cached);
//     }

//     try {
//       // Verify campaign ownership
//       const campaign = await prisma.ticketCampaign.findUnique({
//         where: { id: campaignId },
//         select: { sellerId: true, title: true, eventDate: true }
//       });

//       if (!campaign || campaign.sellerId !== sellerId) {
//         throw new Error('Campaign not found or access denied');
//       }

//       const whereClause = {
//         campaignId,
//         ...(startDate && { createdAt: { gte: new Date(startDate) } }),
//         ...(endDate && { createdAt: { lte: new Date(endDate) } })
//       };

//       // Get comprehensive booking statistics
//       const [
//         bookingSummary,
//         statusBreakdown,
//         ticketTypeBreakdown,
//         revenueAnalytics,
//         conversionFunnel,
//         bookingTrends,
//         customerInsights,
//         refundAnalytics
//       ] = await Promise.all([
//         this._getBookingSummary(whereClause),
//         this._getBookingStatusBreakdown(whereClause),
//         this._getTicketTypeBreakdown(whereClause),
//         this._getRevenueAnalytics(whereClause),
//         this._getConversionFunnel(campaignId, dateRange),
//         this._getBookingTrends(whereClause),
//         this._getCustomerInsights(whereClause),
//         this._getRefundAnalytics(whereClause)
//       ]);

//       const analytics = {
//         campaign: {
//           id: campaignId,
//           title: campaign.title,
//           eventDate: campaign.eventDate
//         },
//         summary: bookingSummary,
//         breakdown: {
//           byStatus: statusBreakdown,
//           byTicketType: ticketTypeBreakdown
//         },
//         revenue: revenueAnalytics,
//         conversion: conversionFunnel,
//         trends: bookingTrends,
//         customers: customerInsights,
//         refunds: refundAnalytics,
//         generatedAt: new Date()
//       };

//       // Cache for 15 minutes
//       await cache.set(cacheKey, JSON.stringify(analytics), 900);

//       return analytics;
//     } catch (error) {
//       logger.error('Campaign booking analytics failed:', { campaignId, error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Get seller booking analytics across all campaigns
//    */
//   async getSellerBookingAnalytics(sellerId, dateRange = {}) {
//     const { startDate, endDate, period = 'month' } = dateRange;
//     const cacheKey = `seller_booking_analytics:${sellerId}:${startDate || 'all'}:${endDate || 'all'}:${period}`;
    
//     const cached = await cache.get(cacheKey);
//     if (cached) {
//       return JSON.parse(cached);
//     }

//     try {
//       const whereClause = {
//         campaign: { sellerId },
//         ...(startDate && { createdAt: { gte: new Date(startDate) } }),
//         ...(endDate && { createdAt: { lte: new Date(endDate) } })
//       };

//       const [
//         overallSummary,
//         campaignPerformance,
//         revenueBreakdown,
//         bookingTrends,
//         topPerformers,
//         customerAnalytics,
//         conversionMetrics
//       ] = await Promise.all([
//         this._getSellerBookingSummary(whereClause),
//         this._getCampaignPerformance(sellerId, dateRange),
//         this._getSellerRevenueBreakdown(whereClause),
//         this._getSellerBookingTrends(whereClause, period),
//         this._getTopPerformingCampaigns(sellerId, dateRange),
//         this._getSellerCustomerAnalytics(whereClause),
//         this._getSellerConversionMetrics(sellerId, dateRange)
//       ]);

//       const analytics = {
//         sellerId,
//         summary: overallSummary,
//         campaigns: campaignPerformance,
//         revenue: revenueBreakdown,
//         trends: bookingTrends,
//         topPerformers,
//         customers: customerAnalytics,
//         conversion: conversionMetrics,
//         generatedAt: new Date()
//       };

//       // Cache for 30 minutes
//       await cache.set(cacheKey, JSON.stringify(analytics), 1800);

//       return analytics;
//     } catch (error) {
//       logger.error('Seller booking analytics failed:', { sellerId, error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Get platform-wide booking analytics (Admin only)
//    */
//   async getPlatformBookingAnalytics(dateRange = {}) {
//     const { startDate, endDate, period = 'day' } = dateRange;
//     const cacheKey = `platform_booking_analytics:${startDate || 'all'}:${endDate || 'all'}:${period}`;
    
//     const cached = await cache.get(cacheKey);
//     if (cached) {
//       return JSON.parse(cached);
//     }

//     try {
//       const whereClause = {
//         ...(startDate && { createdAt: { gte: new Date(startDate) } }),
//         ...(endDate && { createdAt: { lte: new Date(endDate) } })
//       };

//       const [
//         platformSummary,
//         marketplaceMetrics,
//         sellerInsights,
//         eventTypePerformance,
//         geographicDistribution,
//         timeBasedTrends,
//         customerBehavior
//       ] = await Promise.all([
//         this._getPlatformBookingSummary(whereClause),
//         this._getMarketplaceMetrics(whereClause),
//         this._getSellerInsights(whereClause),
//         this._getEventTypePerformance(whereClause),
//         this._getGeographicDistribution(whereClause),
//         this._getTimeBasedTrends(whereClause, period),
//         this._getPlatformCustomerBehavior(whereClause)
//       ]);

//       const analytics = {
//         platform: platformSummary,
//         marketplace: marketplaceMetrics,
//         sellers: sellerInsights,
//         eventTypes: eventTypePerformance,
//         geography: geographicDistribution,
//         trends: timeBasedTrends,
//         customerBehavior,
//         generatedAt: new Date()
//       };

//       // Cache for 1 hour
//       await cache.set(cacheKey, JSON.stringify(analytics), 3600);

//       return analytics;
//     } catch (error) {
//       logger.error('Platform booking analytics failed:', { error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Get real-time booking metrics
//    */
//   async getRealTimeBookingMetrics() {
//     const now = new Date();
//     const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//     const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

//     const [
//       currentBookings,
//       hourlyBookings,
//       activeUsers,
//       topCampaigns,
//       revenueToday
//     ] = await Promise.all([
//       this._getCurrentBookings(),
//       this._getHourlyBookings(lastHour),
//       this._getActiveUsers(lastHour),
//       this._getTrendingCampaigns(last24Hours),
//       this._getTodayRevenue()
//     ]);

//     return {
//       current: currentBookings,
//       hourly: hourlyBookings,
//       activeUsers,
//       trending: topCampaigns,
//       revenue: revenueToday,
//       timestamp: now
//     };
//   }

//   // Private helper methods for campaign analytics
//   async _getBookingSummary(whereClause) {
//     const summary = await prisma.booking.groupBy({
//       by: [],
//       where: whereClause,
//       _count: { id: true },
//       _sum: {
//         quantity: true,
//         totalAmount: true
//       }
//     });

//     const confirmedBookings = await prisma.booking.groupBy({
//       by: [],
//       where: { ...whereClause, status: 'CONFIRMED' },
//       _count: { id: true },
//       _sum: {
//         quantity: true,
//         totalAmount: true
//       }
//     });

//     return {
//       totalBookings: summary[0]?._count.id || 0,
//       totalTickets: summary[0]?._sum.quantity || 0,
//       totalRevenue: summary[0]?._sum.totalAmount || 0,
//       confirmedBookings: confirmedBookings[0]?._count.id || 0,
//       confirmedTickets: confirmedBookings[0]?._sum.quantity || 0,
//       confirmedRevenue: confirmedBookings[0]?._sum.totalAmount || 0,
//       conversionRate: summary[0]?._count.id ? 
//         (confirmedBookings[0]?._count.id / summary[0]._count.id * 100) : 0
//     };
//   }

//   async _getBookingStatusBreakdown(whereClause) {
//     return await prisma.booking.groupBy({
//       by: ['status'],
//       where: whereClause,
//       _count: { id: true },
//       _sum: {
//         quantity: true,
//         totalAmount: true
//       }
//     });
//   }

//   async _getTicketTypeBreakdown(whereClause) {
//     return await prisma.booking.groupBy({
//       by: ['ticketType'],
//       where: whereClause,
//       _count: { id: true },
//       _sum: {
//         quantity: true,
//         totalAmount: true
//       },
//       orderBy: { _sum: { totalAmount: 'desc' } }
//     });
//   }

//   async _getRevenueAnalytics(whereClause) {
//     const revenueByDate = await prisma.$queryRaw`
//       SELECT 
//         DATE(created_at) as date,
//         COUNT(*) as bookings,
//         SUM(quantity) as tickets,
//         SUM(total_amount) as revenue,
//         AVG(total_amount) as avg_booking_value
//       FROM bookings
//       WHERE ${whereClause ? this._buildWhereClause(whereClause) : '1=1'}
//         AND status = 'CONFIRMED'
//       GROUP BY DATE(created_at)
//       ORDER BY date DESC
//       LIMIT 30
//     `;

//     return {
//       daily: revenueByDate,
//       averageBookingValue: revenueByDate.length > 0 ? 
//         revenueByDate.reduce((sum, day) => sum + parseFloat(day.avg_booking_value), 0) / revenueByDate.length : 0
//     };
//   }

//   async _getConversionFunnel(campaignId, dateRange) {
//     // This would integrate with analytics service to track views -> bookings -> confirmations
//     const campaignViews = await prisma.campaignAnalytics.findUnique({
//       where: { campaignId },
//       select: { totalViews: true }
//     });

//     const bookings = await prisma.booking.count({
//       where: { campaignId }
//     });

//     const confirmedBookings = await prisma.booking.count({
//       where: { campaignId, status: 'CONFIRMED' }
//     });

//     return {
//       views: campaignViews?.totalViews || 0,
//       bookings,
//       confirmations: confirmedBookings,
//       viewToBooking: campaignViews?.totalViews ? (bookings / campaignViews.totalViews * 100) : 0,
//       bookingToConfirmation: bookings ? (confirmedBookings / bookings * 100) : 0
//     };
//   }

//   async _getBookingTrends(whereClause) {
//     return await prisma.$queryRaw`
//       SELECT 
//         DATE_TRUNC('day', created_at) as date,
//         COUNT(*) as bookings,
//         SUM(quantity) as tickets,
//         COUNT(DISTINCT customer_id) as unique_customers
//       FROM bookings
//       WHERE ${whereClause ? this._buildWhereClause(whereClause) : '1=1'}
//       GROUP BY DATE_TRUNC('day', created_at)
//       ORDER BY date DESC
//       LIMIT 30
//     `;
//   }

//   async _getCustomerInsights(whereClause) {
//     const [
//       uniqueCustomers,
//       repeatCustomers,
//       customerDistribution
//     ] = await Promise.all([
//       prisma.booking.groupBy({
//         by: ['customerId'],
//         where: whereClause,
//         _count: { id: true }
//       }),
//       prisma.booking.groupBy({
//         by: ['customerId'],
//         where: whereClause,
//         having: { id: { _count: { gt: 1 } } },
//         _count: { id: true }
//       }),
//       prisma.booking.groupBy({
//         by: ['customerId'],
//         where: whereClause,
//         _count: { id: true },
//         _sum: { totalAmount: true }
//       })
//     ]);

//     return {
//       totalUniqueCustomers: uniqueCustomers.length,
//       repeatCustomers: repeatCustomers.length,
//       customerRetentionRate: uniqueCustomers.length ? (repeatCustomers.length / uniqueCustomers.length * 100) : 0,
//       averageBookingsPerCustomer: uniqueCustomers.length ? 
//         (uniqueCustomers.reduce((sum, c) => sum + c._count.id, 0) / uniqueCustomers.length) : 0,
//       topCustomers: customerDistribution
//         .sort((a, b) => b._sum.totalAmount - a._sum.totalAmount)
//         .slice(0, 10)
//     };
//   }

//   async _getRefundAnalytics(whereClause) {
//     const refundRequests = await prisma.refundRequest.findMany({
//       where: {
//         booking: whereClause
//       },
//       include: {
//         booking: {
//           select: {
//             totalAmount: true,
//             status: true
//           }
//         }
//       }
//     });

//     const totalRequests = refundRequests.length;
//     const approvedRefunds = refundRequests.filter(r => r.status === 'APPROVED');
//     const totalRefundAmount = approvedRefunds.reduce((sum, r) => sum + parseFloat(r.amount), 0);

//     return {
//       totalRequests,
//       approvedRefunds: approvedRefunds.length,
//       rejectedRefunds: refundRequests.filter(r => r.status === 'REJECTED').length,
//       pendingRefunds: refundRequests.filter(r => r.status === 'PENDING').length,
//       totalRefundAmount,
//       refundRate: totalRequests ? (approvedRefunds.length / totalRequests * 100) : 0
//     };
//   }

//   // Private helper methods for seller analytics
//   async _getSellerBookingSummary(whereClause) {
//     const [totalBookings, confirmedBookings, revenue] = await Promise.all([
//       prisma.booking.count({ where: whereClause }),
//       prisma.booking.count({ where: { ...whereClause, status: 'CONFIRMED' } }),
//       prisma.booking.aggregate({
//         where: { ...whereClause, status: 'CONFIRMED' },
//         _sum: { totalAmount: true }
//       })
//     ]);

//     return {
//       totalBookings,
//       confirmedBookings,
//       totalRevenue: revenue._sum.totalAmount || 0,
//       conversionRate: totalBookings ? (confirmedBookings / totalBookings * 100) : 0
//     };
//   }

//   async _getCampaignPerformance(sellerId, dateRange) {
//     const campaigns = await prisma.ticketCampaign.findMany({
//       where: {
//         sellerId,
//         ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } })
//       },
//       include: {
//         bookings: {
//           where: {
//             ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } }),
//             ...(dateRange.endDate && { createdAt: { lte: new Date(dateRange.endDate) } })
//           }
//         },
//         analytics: true
//       }
//     });

//     return campaigns.map(campaign => ({
//       id: campaign.id,
//       title: campaign.title,
//       eventDate: campaign.eventDate,
//       totalBookings: campaign.bookings.length,
//       confirmedBookings: campaign.bookings.filter(b => b.status === 'CONFIRMED').length,
//       revenue: campaign.bookings
//         .filter(b => b.status === 'CONFIRMED')
//         .reduce((sum, b) => sum + parseFloat(b.totalAmount), 0),
//       views: campaign.analytics?.totalViews || 0,
//       conversionRate: campaign.analytics?.conversionRate || 0
//     }));
//   }

//   // Additional helper methods would continue here...
//   // For brevity, I'm showing the structure. In a real implementation,
//   // you'd continue with all the remaining private methods.

//   _buildWhereClause(whereClause) {
//     // Helper to convert Prisma where clause to raw SQL
//     // This is a simplified version - in production you'd need more robust SQL building
//     let sql = '1=1';
    
//     if (whereClause.campaignId) {
//       sql += ` AND campaign_id = '${whereClause.campaignId}'`;
//     }
    
//     if (whereClause.createdAt?.gte) {
//       sql += ` AND created_at >= '${whereClause.createdAt.gte.toISOString()}'`;
//     }
    
//     if (whereClause.createdAt?.lte) {
//       sql += ` AND created_at <= '${whereClause.createdAt.lte.toISOString()}'`;
//     }
    
//     return sql;
//   }

//   async _getCurrentBookings() {
//     return await prisma.booking.count({
//       where: {
//         status: 'PENDING',
//         paymentDeadline: { gt: new Date() }
//       }
//     });
//   }

//   async _getHourlyBookings(since) {
//     return await prisma.booking.count({
//       where: {
//         createdAt: { gte: since }
//       }
//     });
//   }

//   async _getActiveUsers(since) {
//     const uniqueUsers = await prisma.booking.groupBy({
//       by: ['customerId'],
//       where: {
//         createdAt: { gte: since }
//       }
//     });
//     return uniqueUsers.length;
//   }

//   async _getTrendingCampaigns(since) {
//     return await prisma.ticketCampaign.findMany({
//       where: {
//         bookings: {
//           some: {
//             createdAt: { gte: since }
//           }
//         }
//       },
//       include: {
//         _count: {
//           select: {
//             bookings: {
//               where: {
//                 createdAt: { gte: since }
//               }
//             }
//           }
//         }
//       },
//       orderBy: {
//         bookings: {
//           _count: 'desc'
//         }
//       },
//       take: 5
//     });
//   }

//   async _getTodayRevenue() {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
    
//     const result = await prisma.booking.aggregate({
//       where: {
//         createdAt: { gte: today },
//         status: 'CONFIRMED'
//       },
//       _sum: { totalAmount: true }
//     });
    
//     return result._sum.totalAmount || 0;
//   }
// }

// export default new BookingAnalyticsService();

import { PrismaClient, Prisma } from '@prisma/client';
import { cache } from '../../../config/redis.js';
import logger from '../../../config/logger.js';

const prisma = new PrismaClient();

/**
 * Booking Analytics Service
 * * Features:
 * - SQL Injection safe (uses Prisma.sql)
 * - Type-safe JSON serialization (BigInt handling)
 * - Case-sensitive Postgres identifiers
 * - Optimized aggregation for high-volume data
 */
class BookingAnalyticsService {
  
  // ===========================================================================
  // 1. CAMPAIGN LEVEL ANALYTICS
  // ===========================================================================
  
  async getCampaignBookingAnalytics(campaignId, sellerId, dateRange = {}) {
    const { startDate, endDate } = dateRange;
    const cacheKey = `booking_analytics:${campaignId}:${startDate || 'all'}:${endDate || 'all'}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      // Verify ownership
      const campaign = await prisma.ticketCampaign.findUnique({
        where: { id: campaignId },
        select: { sellerId: true, title: true, eventDate: true }
      });

      if (!campaign || campaign.sellerId !== sellerId) {
        throw new Error('Campaign not found or access denied');
      }

      // Build Filters
      const prismaWhere = {
        campaignId,
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } })
      };

      const rawWhere = this._buildRawWhereCampaign(campaignId, startDate, endDate);

      // Execute Parallel Queries
      const [summary, status, ticketTypes, revenue, trends, customers] = await Promise.all([
        this._getBookingSummary(prismaWhere),
        this._getBookingStatusBreakdown(prismaWhere),
        this._getTicketTypeBreakdown(prismaWhere),
        this._getRevenueAnalytics(rawWhere), 
        this._getBookingTrends(rawWhere),    
        this._getCustomerInsights(prismaWhere)
      ]);

      const analytics = {
        campaign: {
          id: campaignId,
          title: campaign.title,
          eventDate: campaign.eventDate
        },
        summary,
        breakdown: {
          byStatus: status,
          byTicketType: ticketTypes
        },
        revenue,
        trends,
        customers,
        generatedAt: new Date()
      };

      await cache.set(cacheKey, JSON.stringify(analytics), 900); // Cache 15 mins
      return analytics;
    } catch (error) {
      logger.error('Campaign booking analytics failed:', { campaignId, error: error.message });
      throw error;
    }
  }

  // ===========================================================================
  // 2. SELLER LEVEL ANALYTICS
  // ===========================================================================

  async getSellerBookingAnalytics(sellerId, dateRange = {}) {
    const { startDate, endDate, period = 'day' } = dateRange;
    const cacheKey = `seller_analytics:${sellerId}:${startDate || 'all'}:${endDate || 'all'}:${period}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      // Prisma Filter
      const prismaWhere = {
        campaign: { sellerId },
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } })
      };

      // Raw Filter for JOINs
      const rawWhere = this._buildRawWhereSeller(sellerId, startDate, endDate);

      const [
        summary,
        campaignPerformance,
        revenueTrends,
        topPerformers,
        customers
      ] = await Promise.all([
        this._getBookingSummary(prismaWhere),
        this._getCampaignPerformanceOptimized(sellerId, dateRange), // Optimized
        this._getSellerRevenueOverTime(rawWhere, period),
        this._getTopPerformingCampaigns(sellerId, dateRange),
        this._getCustomerInsights(prismaWhere)
      ]);

      const analytics = {
        sellerId,
        summary,
        campaigns: campaignPerformance,
        revenue: revenueTrends,
        topPerformers,
        customers,
        generatedAt: new Date()
      };

      await cache.set(cacheKey, JSON.stringify(analytics), 1800); // Cache 30 mins
      return analytics;
    } catch (error) {
      logger.error('Seller booking analytics failed:', { sellerId, error: error.message });
      throw error;
    }
  }

  // ===========================================================================
  // 3. REALTIME METRICS
  // ===========================================================================

  async getRealTimeBookingMetrics() {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0,0,0,0);

    const [pending, lastHourCount, revenueToday, activeUsers] = await Promise.all([
      prisma.booking.count({ 
        where: { status: 'PENDING' } 
      }),
      prisma.booking.count({ 
        where: { createdAt: { gte: lastHour } } 
      }),
      prisma.booking.aggregate({
        where: { createdAt: { gte: today }, status: 'CONFIRMED' },
        _sum: { totalAmount: true }
      }),
      prisma.booking.groupBy({
        by: ['customerId'],
        where: { createdAt: { gte: lastHour } }
      })
    ]);

    return {
      currentPending: pending,
      bookingsLastHour: lastHourCount,
      revenueToday: Number(revenueToday._sum.totalAmount || 0),
      activeUsersLastHour: activeUsers.length,
      timestamp: now
    };
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * General Summary (Count, Sum, Conversion)
   * Uses 'aggregate' for efficient database-side summation
   */
  async _getBookingSummary(whereClause) {
    const summary = await prisma.booking.aggregate({
      where: whereClause,
      _count: { id: true },
      _sum: { quantity: true, totalAmount: true }
    });

    const confirmed = await prisma.booking.aggregate({
      where: { ...whereClause, status: 'CONFIRMED' },
      _count: { id: true },
      _sum: { quantity: true, totalAmount: true }
    });

    const totalCount = summary._count.id || 0;
    const confirmedCount = confirmed._count.id || 0;

    return {
      totalBookings: totalCount,
      totalTickets: summary._sum.quantity || 0,
      totalRevenue: Number(summary._sum.totalAmount || 0),
      confirmedBookings: confirmedCount,
      confirmedTickets: confirmed._sum.quantity || 0,
      confirmedRevenue: Number(confirmed._sum.totalAmount || 0),
      conversionRate: totalCount ? (confirmedCount / totalCount * 100) : 0
    };
  }

  async _getBookingStatusBreakdown(whereClause) {
    return await prisma.booking.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { id: true },
      _sum: { totalAmount: true }
    });
  }

  async _getTicketTypeBreakdown(whereClause) {
    return await prisma.booking.groupBy({
      by: ['ticketType'],
      where: whereClause,
      _count: { id: true },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } }
    });
  }

  async _getCustomerInsights(whereClause) {
    // Parallelize customer insights
    const [unique, repeat, top] = await Promise.all([
      prisma.booking.groupBy({ by: ['customerId'], where: whereClause }),
      prisma.booking.groupBy({ 
        by: ['customerId'], 
        where: whereClause, 
        having: { id: { _count: { gt: 1 } } } 
      }),
      prisma.booking.groupBy({
        by: ['customerId'],
        where: whereClause,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5
      })
    ]);

    return {
      uniqueCustomers: unique.length,
      repeatCustomers: repeat.length,
      retentionRate: unique.length ? (repeat.length / unique.length * 100) : 0,
      topSpenders: top.map(c => ({
        customerId: c.customerId,
        totalSpent: Number(c._sum.totalAmount)
      }))
    };
  }

  // --- Optimized Seller Helpers ---

  /**
   * Optimized Campaign Performance
   * 1. Fetches minimal campaign details
   * 2. Fetches aggregated booking stats grouped by campaignId
   * 3. Merges results in memory
   */
  async _getCampaignPerformanceOptimized(sellerId, dateRange) {
    // 1. Get all campaigns for this seller
    const campaigns = await prisma.ticketCampaign.findMany({
      where: { 
        sellerId,
        ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } })
      },
      select: { id: true, title: true }
    });

    const campaignIds = campaigns.map(c => c.id);

    // 2. Aggregate booking data grouped by campaignId
    const bookingStats = await prisma.booking.groupBy({
      by: ['campaignId'],
      where: {
        campaignId: { in: campaignIds },
        ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } }),
        ...(dateRange.endDate && { createdAt: { lte: new Date(dateRange.endDate) } })
      },
      _count: { id: true },
      _sum: { totalAmount: true }
    });

    // 3. Map and Merge
    return campaigns.map(campaign => {
      const stats = bookingStats.find(s => s.campaignId === campaign.id);
      return {
        id: campaign.id,
        title: campaign.title,
        totalBookings: stats?._count.id || 0,
        totalRevenue: Number(stats?._sum.totalAmount || 0)
      };
    });
  }

  async _getTopPerformingCampaigns(sellerId, dateRange) {
    const top = await prisma.booking.groupBy({
      by: ['campaignId'],
      where: {
        campaign: { sellerId },
        status: 'CONFIRMED',
        ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } })
      },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5
    });

    const campaignIds = top.map(t => t.campaignId);
    const campaigns = await prisma.ticketCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, title: true }
    });

    return top.map(t => ({
      campaignId: t.campaignId,
      title: campaigns.find(c => c.id === t.campaignId)?.title || 'Unknown',
      revenue: Number(t._sum.totalAmount)
    }));
  }

  // --- Raw SQL Helpers (Case Sensitive & Type Safe) ---

  async _getRevenueAnalytics(rawWhere) {
    const result = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*)::int as bookings,
        SUM("quantity")::int as tickets,
        SUM("totalAmount")::float as revenue
      FROM "bookings"
      WHERE ${rawWhere} AND "status" = 'CONFIRMED'
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
      LIMIT 30
    `;
    return result;
  }

  async _getBookingTrends(rawWhere) {
    const result = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', "createdAt") as date,
        COUNT(*)::int as bookings,
        COUNT(DISTINCT "customerId")::int as unique_customers
      FROM "bookings"
      WHERE ${rawWhere}
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date DESC
      LIMIT 30
    `;
    return result;
  }

  async _getSellerRevenueOverTime(rawWhere, period) {
    const validPeriods = ['day', 'week', 'month'];
    const safePeriod = validPeriods.includes(period) ? period : 'day';
    
    // JOIN ticket_campaigns (c) and bookings (b)
    return await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${Prisma.sql`${safePeriod}`}, b."createdAt") as date,
        COUNT(b.id)::int as bookings,
        SUM(b."totalAmount")::float as revenue
      FROM "bookings" b
      JOIN "ticket_campaigns" c ON b."campaignId" = c.id
      WHERE ${rawWhere} AND b."status" = 'CONFIRMED'
      GROUP BY DATE_TRUNC(${Prisma.sql`${safePeriod}`}, b."createdAt")
      ORDER BY date DESC
      LIMIT 30
    `;
  }

  // --- SQL Where Clause Builders ---

  _buildRawWhereCampaign(campaignId, startDate, endDate) {
    const conditions = [Prisma.sql`"campaignId" = ${campaignId}`];
    
    if (startDate) conditions.push(Prisma.sql`"createdAt" >= ${new Date(startDate)}`);
    if (endDate) conditions.push(Prisma.sql`"createdAt" <= ${new Date(endDate)}`);

    return conditions.length 
      ? Prisma.sql`${Prisma.join(conditions, ' AND ')}` 
      : Prisma.empty;
  }

  _buildRawWhereSeller(sellerId, startDate, endDate) {
    // Aliased: c = ticket_campaigns, b = bookings
    const conditions = [Prisma.sql`c."sellerId" = ${sellerId}`];
    
    if (startDate) conditions.push(Prisma.sql`b."createdAt" >= ${new Date(startDate)}`);
    if (endDate) conditions.push(Prisma.sql`b."createdAt" <= ${new Date(endDate)}`);

    return conditions.length 
      ? Prisma.sql`${Prisma.join(conditions, ' AND ')}` 
      : Prisma.empty;
  }
}

export default new BookingAnalyticsService();