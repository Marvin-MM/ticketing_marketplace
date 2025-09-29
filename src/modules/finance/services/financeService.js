import prisma from '../../../config/database.js';
import { cache } from '../../../config/redis.js';
import { emailQueue, financeQueue } from '../../../config/rabbitmq.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { encrypt, decrypt, generateUniqueId } from '../../../shared/utils/encryption.js';
import { 
  ValidationError, 
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from '../../../shared/errors/AppError.js';

/**
 * Enhanced Finance Service with comprehensive financial management
 */
class FinanceService {
  /**
   * Get comprehensive financial dashboard for seller
   */
  async getFinancialDashboard(sellerId, filters = {}) {
    const { period = '30d', currency = 'USD' } = filters;
    
    const cacheKey = `finance_dashboard:${sellerId}:${period}:${currency}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Get or create finance record
      const finance = await this._getOrCreateFinanceRecord(sellerId);

      // Get comprehensive financial data
      const [
        financialSummary,
        recentTransactions,
        withdrawalMethods,
        revenueAnalytics,
        pendingWithdrawals,
        taxSummary,
        commissionBreakdown,
        cashflowAnalysis
      ] = await Promise.all([
        this._getFinancialSummary(finance, period),
        this._getRecentTransactions(sellerId, 15),
        this._getWithdrawalMethods(sellerId),
        this._getRevenueAnalytics(sellerId, period),
        this._getPendingWithdrawals(finance.id),
        this._getTaxSummary(sellerId, period),
        this._getCommissionBreakdown(sellerId, period),
        this._getCashflowAnalysis(sellerId, period)
      ]);

      const dashboard = {
        finance: {
          ...finance,
          availableForWithdrawal: await this._calculateAvailableForWithdrawal(finance),
          estimatedTaxes: taxSummary.estimatedTaxes,
          nextPayoutDate: await this._calculateNextPayoutDate(sellerId)
        },
        summary: financialSummary,
        transactions: recentTransactions,
        withdrawalMethods,
        analytics: revenueAnalytics,
        pending: pendingWithdrawals,
        taxes: taxSummary,
        commissions: commissionBreakdown,
        cashflow: cashflowAnalysis,
        generatedAt: new Date()
      };

      // Cache for 15 minutes
      await cache.set(cacheKey, JSON.stringify(dashboard), 900);

      return dashboard;

    } catch (error) {
      logger.error('Financial dashboard failed:', { sellerId, error: error.message });
      throw error;
    }
  }

  /**
   * Process automated withdrawal with enhanced validation
   */
  async processAutomatedWithdrawal(sellerId, withdrawalData) {
    const { amount, methodId, scheduledFor, priority = 'NORMAL' } = withdrawalData;

    try {
      // Enhanced validation
      await this._validateWithdrawalEligibility(sellerId, amount, methodId);

      // Get finance record and withdrawal method
      const [finance, method] = await Promise.all([
        this._getFinanceRecord(sellerId),
        this._getWithdrawalMethod(methodId, sellerId)
      ]);

      // Calculate fees and net amount
      const feeCalculation = await this._calculateWithdrawalFees(amount, method.method, priority);

      // Create withdrawal in transaction
      const withdrawal = await prisma.$transaction(async (tx) => {
        // Create withdrawal record
        const newWithdrawal = await tx.withdrawal.create({
          data: {
            financeId: finance.id,
            methodId,
            amount,
            fee: feeCalculation.totalFee,
            netAmount: feeCalculation.netAmount,
            status: scheduledFor ? 'SCHEDULED' : 'PENDING',
            reference: generateUniqueId('WTH'),
            processedAt: scheduledFor ? new Date(scheduledFor) : null,
            metadata: {
              priority,
              feeBreakdown: feeCalculation.breakdown,
              scheduledProcessing: !!scheduledFor,
              automatedRequest: true
            }
          }
        });

        // Update finance balances
        await tx.finance.update({
          where: { id: finance.id },
          data: {
            availableBalance: { decrement: amount },
            pendingBalance: { increment: amount }
          }
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            financeId: finance.id,
            userId: sellerId,
            type: 'WITHDRAWAL',
            amount,
            balanceBefore: finance.availableBalance,
            balanceAfter: Number(finance.availableBalance) - amount,
            reference: newWithdrawal.reference,
            description: `Automated withdrawal to ${method.method}`,
            metadata: {
              withdrawalId: newWithdrawal.id,
              automated: true,
              priority
            }
          }
        });

        return newWithdrawal;
      });

      // Queue withdrawal processing
      await this._queueWithdrawalProcessing(withdrawal, method, priority);

      // Send notification
      await this._sendWithdrawalNotification(sellerId, withdrawal, 'INITIATED');

      logger.info('Automated withdrawal processed', {
        sellerId,
        withdrawalId: withdrawal.id,
        amount: withdrawal.amount,
        priority
      });

      return withdrawal;

    } catch (error) {
      logger.error('Automated withdrawal failed:', {
        sellerId,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive financial report
   */
  async generateFinancialReport(sellerId, reportConfig) {
    const {
      type = 'COMPREHENSIVE',
      period,
      startDate,
      endDate,
      includeTransactions = true,
      includeTaxes = true,
      includeProjections = false,
      format = 'JSON'
    } = reportConfig;

    const cacheKey = `financial_report:${sellerId}:${JSON.stringify(reportConfig)}`;
    
    try {
      const dateRange = this._calculateDateRange(period, startDate, endDate);

      const reportData = {};

      // Basic financial summary
      reportData.summary = await this._getDetailedFinancialSummary(sellerId, dateRange);

      // Revenue analysis
      reportData.revenue = await this._getRevenueAnalysis(sellerId, dateRange);

      // Commission analysis
      reportData.commissions = await this._getCommissionAnalysis(sellerId, dateRange);

      if (includeTransactions) {
        reportData.transactions = await this._getTransactionAnalysis(sellerId, dateRange);
      }

      if (includeTaxes) {
        reportData.taxes = await this._getTaxAnalysis(sellerId, dateRange);
      }

      // Withdrawal analysis
      reportData.withdrawals = await this._getWithdrawalAnalysis(sellerId, dateRange);

      // Performance metrics
      reportData.metrics = await this._getPerformanceMetrics(sellerId, dateRange);

      if (includeProjections) {
        reportData.projections = await this._getFinancialProjections(sellerId);
      }

      // Campaign performance
      reportData.campaigns = await this._getCampaignFinancialPerformance(sellerId, dateRange);

      const report = {
        reportId: generateUniqueId('RPT'),
        sellerId,
        type,
        period: dateRange,
        generatedAt: new Date(),
        data: reportData,
        metadata: {
          totalPages: this._calculateReportPages(reportData),
          dataPoints: this._countDataPoints(reportData),
          currency: 'USD'
        }
      };

      // Store report for future reference
      await this._storeFinancialReport(report);

      logger.info('Financial report generated', {
        sellerId,
        reportId: report.reportId,
        type,
        period: dateRange
      });

      return format === 'PDF' ? await this._generatePDFReport(report) : report;

    } catch (error) {
      logger.error('Financial report generation failed:', {
        sellerId,
        reportConfig,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate and update commission rates
   */
  async updateCommissionRates(sellerId, rateConfig) {
    const {
      baseRate,
      tieredRates = [],
      eventTypeRates = {},
      performanceBonus = {},
      effectiveDate = new Date()
    } = rateConfig;

    try {
      // Validate rate configuration
      await this._validateRateConfiguration(rateConfig);

      // Get seller performance metrics
      const performance = await this._getSellerPerformance(sellerId);

      // Calculate new effective rates
      const effectiveRates = await this._calculateEffectiveRates(
        baseRate,
        tieredRates,
        eventTypeRates,
        performance,
        performanceBonus
      );

      // Create commission rate record
      const commissionRate = await prisma.commissionRate.create({
        data: {
          sellerId,
          baseRate,
          tieredRates,
          eventTypeRates,
          performanceBonus,
          effectiveRates,
          effectiveDate,
          isActive: true,
          metadata: {
            previousRates: await this._getCurrentRates(sellerId),
            performanceMetrics: performance,
            calculatedBy: 'SYSTEM',
            reason: 'PERFORMANCE_UPDATE'
          }
        }
      });

      // Deactivate previous rates
      await prisma.commissionRate.updateMany({
        where: {
          sellerId,
          id: { not: commissionRate.id },
          isActive: true
        },
        data: { isActive: false }
      });

      logger.info('Commission rates updated', {
        sellerId,
        rateId: commissionRate.id,
        effectiveRates
      });

      return {
        commissionRate,
        effectiveRates,
        estimatedImpact: await this._estimateRateImpact(sellerId, effectiveRates)
      };

    } catch (error) {
      logger.error('Commission rate update failed:', {
        sellerId,
        rateConfig,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process bulk payouts for multiple sellers
   */
  async processBulkPayouts(payoutConfig) {
    const {
      sellerIds,
      minimumAmount = 50,
      currency = 'USD',
      processingDate = new Date(),
      batchSize = 50,
      priority = 'NORMAL'
    } = payoutConfig;

    const batchId = generateUniqueId('BATCH');

    try {
      // Validate bulk payout configuration
      await this._validateBulkPayoutConfig(payoutConfig);

      // Process sellers in batches
      const results = [];
      for (let i = 0; i < sellerIds.length; i += batchSize) {
        const batch = sellerIds.slice(i, i + batchSize);
        const batchResults = await this._processBatch(
          batch,
          minimumAmount,
          currency,
          processingDate,
          priority,
          `${batchId}-${Math.floor(i / batchSize) + 1}`
        );
        results.push(...batchResults);
      }

      // Aggregate results
      const summary = this._aggregateBatchResults(results);

      // Create batch payout record
      const batchPayout = await prisma.batchPayout.create({
        data: {
          batchId,
          sellerCount: sellerIds.length,
          successCount: summary.successful.length,
          failureCount: summary.failed.length,
          totalAmount: summary.totalAmount,
          totalFees: summary.totalFees,
          netAmount: summary.netAmount,
          currency,
          status: summary.failed.length > 0 ? 'PARTIAL' : 'SUCCESS',
          processingDate,
          completedAt: new Date(),
          results: results,
          metadata: {
            minimumAmount,
            priority,
            batchSize
          }
        }
      });

      // Send notifications
      await this._sendBatchPayoutNotifications(batchPayout, results);

      logger.info('Bulk payout processed', {
        batchId,
        sellerCount: sellerIds.length,
        successCount: summary.successful.length,
        totalAmount: summary.totalAmount
      });

      return {
        batchPayout,
        summary,
        results
      };

    } catch (error) {
      logger.error('Bulk payout failed:', {
        batchId,
        sellerCount: sellerIds.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reconcile financial records with external systems
   */
  async reconcileFinancialRecords(reconciliationConfig) {
    const {
      startDate,
      endDate,
      includePayments = true,
      includeWithdrawals = true,
      includeRefunds = true,
      externalSources = ['flutterwave'],
      generateReport = true
    } = reconciliationConfig;

    const reconciliationId = generateUniqueId('RECON');

    try {
      const reconciliationData = {
        payments: [],
        withdrawals: [],
        refunds: [],
        discrepancies: []
      };

      if (includePayments) {
        reconciliationData.payments = await this._reconcilePayments(startDate, endDate, externalSources);
      }

      if (includeWithdrawals) {
        reconciliationData.withdrawals = await this._reconcileWithdrawals(startDate, endDate, externalSources);
      }

      if (includeRefunds) {
        reconciliationData.refunds = await this._reconcileRefunds(startDate, endDate, externalSources);
      }

      // Identify discrepancies
      reconciliationData.discrepancies = await this._identifyDiscrepancies(reconciliationData);

      // Generate summary
      const summary = this._generateReconciliationSummary(reconciliationData);

      // Store reconciliation record
      const reconciliation = await prisma.financialReconciliation.create({
        data: {
          reconciliationId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          summary,
          discrepancies: reconciliationData.discrepancies,
          status: reconciliationData.discrepancies.length > 0 ? 'DISCREPANCIES_FOUND' : 'RECONCILED',
          completedAt: new Date(),
          metadata: {
            externalSources,
            totalRecords: summary.totalRecords,
            matchedRecords: summary.matchedRecords,
            unmatchedRecords: summary.unmatchedRecords
          }
        }
      });

      // Generate report if requested
      let report = null;
      if (generateReport) {
        report = await this._generateReconciliationReport(reconciliation, reconciliationData);
      }

      // Send notifications for discrepancies
      if (reconciliationData.discrepancies.length > 0) {
        await this._notifyDiscrepancies(reconciliation, reconciliationData.discrepancies);
      }

      logger.info('Financial reconciliation completed', {
        reconciliationId,
        period: { startDate, endDate },
        discrepancies: reconciliationData.discrepancies.length,
        totalRecords: summary.totalRecords
      });

      return {
        reconciliation,
        summary,
        discrepancies: reconciliationData.discrepancies,
        report
      };

    } catch (error) {
      logger.error('Financial reconciliation failed:', {
        reconciliationId,
        period: { startDate, endDate },
        error: error.message
      });
      throw error;
    }
  }

  // Private helper methods
  async _getOrCreateFinanceRecord(sellerId) {
    let finance = await prisma.finance.findUnique({
      where: { sellerId },
      include: {
        _count: {
          select: {
            withdrawals: true,
            transactions: true
          }
        }
      }
    });

    if (!finance) {
      finance = await prisma.finance.create({
        data: {
          sellerId,
          totalEarnings: 0,
          availableBalance: 0,
          pendingBalance: 0,
          withdrawnAmount: 0,
          currency: 'USD'
        },
        include: {
          _count: {
            select: {
              withdrawals: true,
              transactions: true
            }
          }
        }
      });
    }

    return finance;
  }

  async _getFinancialSummary(finance, period) {
    const dateRange = this._calculateDateRange(period);
    
    const [
      periodRevenue,
      periodWithdrawals,
      periodRefunds,
      projectedEarnings
    ] = await Promise.all([
      this._getPeriodRevenue(finance.sellerId, dateRange),
      this._getPeriodWithdrawals(finance.sellerId, dateRange),
      this._getPeriodRefunds(finance.sellerId, dateRange),
      this._getProjectedEarnings(finance.sellerId)
    ]);

    return {
      currentBalance: {
        available: finance.availableBalance,
        pending: finance.pendingBalance,
        total: finance.totalEarnings,
        withdrawn: finance.withdrawnAmount
      },
      periodPerformance: {
        revenue: periodRevenue,
        withdrawals: periodWithdrawals,
        refunds: periodRefunds,
        netIncome: periodRevenue - periodRefunds
      },
      projections: projectedEarnings
    };
  }

  async _validateWithdrawalEligibility(sellerId, amount, methodId) {
    const [finance, method, activeCampaigns] = await Promise.all([
      this._getFinanceRecord(sellerId),
      this._getWithdrawalMethod(methodId, sellerId),
      this._getActiveCampaigns(sellerId)
    ]);

    // Check minimum withdrawal amount
    const minWithdrawal = config.finance.minimumWithdrawal || 10;
    if (amount < minWithdrawal) {
      throw new ValidationError(`Minimum withdrawal amount is $${minWithdrawal}`);
    }

    // Check available balance
    if (amount > finance.availableBalance) {
      throw new ValidationError(`Insufficient balance. Available: $${finance.availableBalance}`);
    }

    // Check if method is verified
    if (!method.isVerified) {
      throw new ValidationError('Withdrawal method is not verified');
    }

    // Check pending settlements
    const pendingAmount = await this._getPendingSettlementAmount(sellerId);
    if (pendingAmount > 0) {
      throw new ValidationError(`${pendingAmount} is still pending settlement`);
    }

    return { finance, method, activeCampaigns };
  }

  async _calculateWithdrawalFees(amount, method, priority) {
    const baseRate = config.finance.withdrawalFees[method] || 0.02;
    const priorityMultiplier = priority === 'URGENT' ? 1.5 : 1.0;
    
    const baseFee = Math.max(amount * baseRate * priorityMultiplier, 1);
    const processingFee = priority === 'URGENT' ? 5 : 0;
    const totalFee = baseFee + processingFee;
    const netAmount = amount - totalFee;

    return {
      totalFee,
      netAmount,
      breakdown: {
        baseFee,
        processingFee,
        rate: baseRate * priorityMultiplier
      }
    };
  }

  async _queueWithdrawalProcessing(withdrawal, method, priority) {
    const delay = priority === 'URGENT' ? 0 : config.finance.standardProcessingDelay;
    
    await financeQueue.processWithdrawal({
      withdrawalId: withdrawal.id,
      methodId: method.id,
      amount: withdrawal.amount,
      priority,
      processAfter: Date.now() + delay
    });
  }

  _calculateDateRange(period, startDate, endDate) {
    if (startDate && endDate) {
      return { startDate: new Date(startDate), endDate: new Date(endDate) };
    }

    const now = new Date();
    const ranges = {
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      '1y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    };

    return {
      startDate: ranges[period] || ranges['30d'],
      endDate: now
    };
  }
}

export default new FinanceService();