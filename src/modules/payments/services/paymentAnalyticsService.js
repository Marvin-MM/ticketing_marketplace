import prisma from '../../../config/database.js';
import { cache } from '../../../config/redis.js';
import logger from '../../../config/logger.js';

/**
 * Payment Analytics Service for comprehensive financial insights
 */
class PaymentAnalyticsService {
  /**
   * Get comprehensive payment analytics for platform-wide metrics
   */
  async getPlatformPaymentAnalytics(filters = {}) {
    const {
      startDate,
      endDate,
      currency = 'USD',
      groupBy = 'day',
      includeProjections = false
    } = filters;

    const cacheKey = `platform_payment_analytics:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const whereClause = this._buildWhereClause(filters);

      const [
        paymentSummary,
        paymentTrends,
        methodPerformance,
        geographicDistribution,
        failureAnalysis,
        revenueAnalytics,
        conversionMetrics,
        customerInsights
      ] = await Promise.all([
        this._getPlatformPaymentSummary(whereClause),
        this._getPaymentTrends(whereClause, groupBy),
        this._getPaymentMethodPerformance(whereClause),
        this._getGeographicPaymentDistribution(whereClause),
        this._getPaymentFailureAnalysis(whereClause),
        this._getRevenueAnalytics(whereClause, groupBy),
        this._getConversionMetrics(whereClause),
        this._getCustomerPaymentInsights(whereClause)
      ]);

      let projections = null;
      if (includeProjections) {
        projections = await this._getPaymentProjections(whereClause, groupBy);
      }

      const analytics = {
        summary: paymentSummary,
        trends: paymentTrends,
        methods: methodPerformance,
        geography: geographicDistribution,
        failures: failureAnalysis,
        revenue: revenueAnalytics,
        conversion: conversionMetrics,
        customers: customerInsights,
        projections,
        filters,
        generatedAt: new Date()
      };

      // Cache for 30 minutes
      await cache.set(cacheKey, JSON.stringify(analytics), 1800);

      return analytics;

    } catch (error) {
      logger.error('Platform payment analytics failed:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Get seller payment analytics with detailed breakdown
   */
  async getSellerPaymentAnalytics(sellerId, filters = {}) {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      includeForecast = false
    } = filters;

    const cacheKey = `seller_payment_analytics:${sellerId}:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const whereClause = {
        ...this._buildWhereClause(filters),
        booking: {
          campaign: {
            sellerId
          }
        }
      };

      const [
        paymentSummary,
        paymentTrends,
        campaignPerformance,
        customerAnalysis,
        methodBreakdown,
        failureAnalysis,
        settlementAnalytics
      ] = await Promise.all([
        this._getSellerPaymentSummary(whereClause),
        this._getPaymentTrends(whereClause, groupBy),
        this._getCampaignPaymentPerformance(sellerId, filters),
        this._getSellerCustomerAnalysis(sellerId, filters),
        this._getPaymentMethodBreakdown(whereClause),
        this._getSellerFailureAnalysis(whereClause),
        this._getSettlementAnalytics(sellerId, filters)
      ]);

      let forecast = null;
      if (includeForecast) {
        forecast = await this._generatePaymentForecast(sellerId, filters);
      }

      const analytics = {
        sellerId,
        summary: paymentSummary,
        trends: paymentTrends,
        campaigns: campaignPerformance,
        customers: customerAnalysis,
        methods: methodBreakdown,
        failures: failureAnalysis,
        settlements: settlementAnalytics,
        forecast,
        generatedAt: new Date()
      };

      // Cache for 20 minutes
      await cache.set(cacheKey, JSON.stringify(analytics), 1200);

      return analytics;

    } catch (error) {
      logger.error('Seller payment analytics failed:', { sellerId, filters, error: error.message });
      throw error;
    }
  }

  /**
   * Get real-time payment metrics dashboard
   */
  async getRealTimePaymentMetrics() {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      const [
        currentMetrics,
        hourlyTrends,
        failureRates,
        topPerformers,
        alertMetrics
      ] = await Promise.all([
        this._getCurrentPaymentMetrics(),
        this._getHourlyPaymentTrends(last24Hours),
        this._getCurrentFailureRates(lastHour),
        this._getTopPerformingCampaigns(last24Hours),
        this._getPaymentAlertMetrics()
      ]);

      return {
        current: currentMetrics,
        hourly: hourlyTrends,
        failures: failureRates,
        topPerformers,
        alerts: alertMetrics,
        timestamp: now
      };

    } catch (error) {
      logger.error('Real-time payment metrics failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get payment method performance analysis
   */
  async getPaymentMethodAnalytics(filters = {}) {
    const {
      startDate,
      endDate,
      includeBenchmarks = true
    } = filters;

    const cacheKey = `payment_method_analytics:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const whereClause = this._buildWhereClause(filters);

      const [
        methodPerformance,
        successRates,
        averageTransactionValues,
        processingTimes,
        customerPreferences,
        fraudRates
      ] = await Promise.all([
        this._getMethodPerformanceMetrics(whereClause),
        this._getMethodSuccessRates(whereClause),
        this._getMethodTransactionValues(whereClause),
        this._getMethodProcessingTimes(whereClause),
        this._getMethodCustomerPreferences(whereClause),
        this._getMethodFraudRates(whereClause)
      ]);

      let benchmarks = null;
      if (includeBenchmarks) {
        benchmarks = await this._getIndustryBenchmarks();
      }

      const analytics = {
        performance: methodPerformance,
        successRates,
        transactionValues: averageTransactionValues,
        processingTimes,
        preferences: customerPreferences,
        fraud: fraudRates,
        benchmarks,
        filters,
        generatedAt: new Date()
      };

      // Cache for 1 hour
      await cache.set(cacheKey, JSON.stringify(analytics), 3600);

      return analytics;

    } catch (error) {
      logger.error('Payment method analytics failed:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Get revenue analytics with advanced calculations
   */
  async getRevenueAnalytics(filters = {}) {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      includeProjections = false,
      segmentBy
    } = filters;

    try {
      const whereClause = this._buildWhereClause(filters);

      const [
        revenueSummary,
        revenueTrends,
        revenueSegmentation,
        growthMetrics,
        seasonalPatterns
      ] = await Promise.all([
        this._getRevenueSummary(whereClause),
        this._getRevenueTrends(whereClause, groupBy),
        this._getRevenueSegmentation(whereClause, segmentBy),
        this._getGrowthMetrics(whereClause, groupBy),
        this._getSeasonalPatterns(whereClause)
      ]);

      let projections = null;
      if (includeProjections) {
        projections = await this._getRevenueProjections(whereClause, groupBy);
      }

      return {
        summary: revenueSummary,
        trends: revenueTrends,
        segmentation: revenueSegmentation,
        growth: growthMetrics,
        seasonal: seasonalPatterns,
        projections,
        filters,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Revenue analytics failed:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Generate financial KPI report
   */
  async getFinancialKPIs(filters = {}) {
    const {
      startDate,
      endDate,
      compareWithPrevious = true
    } = filters;

    try {
      const currentPeriod = this._buildWhereClause(filters);
      let previousPeriod = null;

      if (compareWithPrevious) {
        const periodLength = new Date(endDate) - new Date(startDate);
        const previousEndDate = new Date(startDate);
        const previousStartDate = new Date(previousEndDate.getTime() - periodLength);
        
        previousPeriod = this._buildWhereClause({
          startDate: previousStartDate,
          endDate: previousEndDate
        });
      }

      const [
        currentKPIs,
        previousKPIs
      ] = await Promise.all([
        this._calculateKPIs(currentPeriod),
        previousPeriod ? this._calculateKPIs(previousPeriod) : null
      ]);

      const comparison = previousKPIs ? this._calculateKPIChanges(currentKPIs, previousKPIs) : null;

      return {
        current: currentKPIs,
        previous: previousKPIs,
        comparison,
        period: { startDate, endDate },
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Financial KPI calculation failed:', { filters, error: error.message });
      throw error;
    }
  }

  // Private helper methods
  _buildWhereClause(filters) {
    const { startDate, endDate, status, currency, paymentMethod } = filters;
    
    const where = {};
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    
    return where;
  }

  async _getPlatformPaymentSummary(whereClause) {
    const [totalPayments, successfulPayments, revenue] = await Promise.all([
      prisma.payment.count({ where: whereClause }),
      prisma.payment.count({ where: { ...whereClause, status: 'SUCCESS' } }),
      prisma.payment.aggregate({
        where: { ...whereClause, status: 'SUCCESS' },
        _sum: { amount: true },
        _avg: { amount: true }
      })
    ]);

    const successRate = totalPayments > 0 ? (successfulPayments / totalPayments * 100) : 0;

    return {
      totalPayments,
      successfulPayments,
      failedPayments: totalPayments - successfulPayments,
      successRate: Math.round(successRate * 100) / 100,
      totalRevenue: revenue._sum.amount || 0,
      averageTransactionValue: revenue._avg.amount || 0
    };
  }

  async _getPaymentTrends(whereClause, groupBy) {
    const groupByClause = this._getGroupByClause(groupBy);
    
    const trends = await prisma.$queryRaw`
      SELECT 
        ${groupByClause} as period,
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_payments,
        SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as revenue,
        AVG(CASE WHEN status = 'SUCCESS' THEN amount ELSE NULL END) as avg_transaction_value
      FROM payments
      WHERE ${this._buildSQLWhereClause(whereClause)}
      GROUP BY ${groupByClause}
      ORDER BY period DESC
      LIMIT 30
    `;

    return trends.map(trend => ({
      ...trend,
      success_rate: trend.total_payments > 0 ? 
        (trend.successful_payments / trend.total_payments * 100) : 0
    }));
  }

  async _getPaymentMethodPerformance(whereClause) {
    return await prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: whereClause,
      _count: { id: true },
      _sum: { amount: true },
      _avg: { amount: true },
      orderBy: { _count: { id: 'desc' } }
    });
  }

  async _getCurrentPaymentMetrics() {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);

    const [
      recentPayments,
      pendingPayments,
      activeTransactions,
      currentRevenue
    ] = await Promise.all([
      prisma.payment.count({
        where: {
          createdAt: { gte: last5Minutes }
        }
      }),
      prisma.payment.count({
        where: {
          status: 'PENDING',
          createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) }
        }
      }),
      prisma.payment.count({
        where: {
          status: 'PENDING'
        }
      }),
      prisma.payment.aggregate({
        where: {
          status: 'SUCCESS',
          createdAt: {
            gte: new Date(now.getTime() - 60 * 60 * 1000)
          }
        },
        _sum: { amount: true }
      })
    ]);

    return {
      recentPayments,
      pendingPayments,
      activeTransactions,
      hourlyRevenue: currentRevenue._sum.amount || 0,
      timestamp: now
    };
  }

  async _getHourlyPaymentTrends(since) {
    return await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as payments,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful,
        SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as revenue
      FROM payments
      WHERE created_at >= ${since}
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
      LIMIT 24
    `;
  }

  async _calculateKPIs(whereClause) {
    const [
      paymentStats,
      revenueStats,
      customerStats,
      operationalStats
    ] = await Promise.all([
      this._getPaymentKPIs(whereClause),
      this._getRevenueKPIs(whereClause),
      this._getCustomerKPIs(whereClause),
      this._getOperationalKPIs(whereClause)
    ]);

    return {
      payments: paymentStats,
      revenue: revenueStats,
      customers: customerStats,
      operations: operationalStats
    };
  }

  async _getPaymentKPIs(whereClause) {
    const stats = await prisma.payment.aggregate({
      where: whereClause,
      _count: { id: true },
      _sum: { amount: true, retryCount: true },
      _avg: { amount: true }
    });

    const successfulPayments = await prisma.payment.count({
      where: { ...whereClause, status: 'SUCCESS' }
    });

    return {
      totalTransactions: stats._count.id,
      successfulTransactions: successfulPayments,
      successRate: stats._count.id > 0 ? (successfulTransactions / stats._count.id * 100) : 0,
      averageTransactionValue: stats._avg.amount || 0,
      totalRetries: stats._sum.retryCount || 0
    };
  }

  _getGroupByClause(groupBy) {
    const clauses = {
      'hour': 'DATE_TRUNC(\'hour\', created_at)',
      'day': 'DATE_TRUNC(\'day\', created_at)',
      'week': 'DATE_TRUNC(\'week\', created_at)',
      'month': 'DATE_TRUNC(\'month\', created_at)'
    };
    
    return clauses[groupBy] || clauses['day'];
  }

  _buildSQLWhereClause(whereClause) {
    // Convert Prisma where clause to raw SQL
    // This is a simplified version - in production you'd need more robust SQL building
    const conditions = [];
    
    if (whereClause.createdAt?.gte) {
      conditions.push(`created_at >= '${whereClause.createdAt.gte.toISOString()}'`);
    }
    
    if (whereClause.createdAt?.lte) {
      conditions.push(`created_at <= '${whereClause.createdAt.lte.toISOString()}'`);
    }
    
    if (whereClause.status) {
      conditions.push(`status = '${whereClause.status}'`);
    }
    
    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  }

  _calculateKPIChanges(current, previous) {
    const changes = {};
    
    const calculateChange = (currentValue, previousValue) => {
      if (previousValue === 0) return currentValue > 0 ? 100 : 0;
      return ((currentValue - previousValue) / previousValue * 100);
    };

    // Calculate changes for each KPI category
    Object.keys(current).forEach(category => {
      changes[category] = {};
      Object.keys(current[category]).forEach(metric => {
        changes[category][metric] = {
          value: current[category][metric],
          previousValue: previous[category][metric],
          change: calculateChange(current[category][metric], previous[category][metric]),
          trend: current[category][metric] > previous[category][metric] ? 'up' : 
                current[category][metric] < previous[category][metric] ? 'down' : 'stable'
        };
      });
    });

    return changes;
  }
}

export default new PaymentAnalyticsService();