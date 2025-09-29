import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import { 
  ValidationError, 
  NotFoundError,
  AuthorizationError,
  ConflictError 
} from '../../../shared/errors/AppError.js';
import { encrypt, decrypt, generateUniqueId } from '../../../shared/utils/encryption.js';
import { financeQueue } from '../../../config/rabbitmq.js';
import financeService from '../services/financeService.js';

/**
 * Get enhanced financial dashboard
 */
export const getFinancialDashboard = async (req, res) => {
  const sellerId = req.user.id;
  const filters = req.query;

  try {
    const dashboard = await financeService.getFinancialDashboard(sellerId, filters);

    res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Financial dashboard failed:', { sellerId, filters, error: error.message });
    throw error;
  }
};

/**
 * Add withdrawal method
 */
export const addWithdrawalMethod = async (req, res) => {
  const sellerId = req.user.id;
  const {
    method,
    accountName,
    accountNumber,
    bankName,
    bankCode,
    mobileProvider,
    mobileNumber,
    paypalEmail,
    setAsDefault,
  } = req.body;

  // Validate method type
  if (!['BANK_ACCOUNT', 'MOBILE_MONEY', 'PAYPAL'].includes(method)) {
    throw new ValidationError('Invalid withdrawal method');
  }

  // Validate required fields based on method
  if (method === 'BANK_ACCOUNT') {
    if (!accountNumber || !bankName || !bankCode) {
      throw new ValidationError('Bank account details are required');
    }
  } else if (method === 'MOBILE_MONEY') {
    if (!mobileProvider || !mobileNumber) {
      throw new ValidationError('Mobile money details are required');
    }
  } else if (method === 'PAYPAL') {
    if (!paypalEmail) {
      throw new ValidationError('PayPal email is required');
    }
  }

  // Check if method already exists
  const existingMethod = await prisma.withdrawalMethod.findFirst({
    where: {
      userId: sellerId,
      method,
      ...(method === 'BANK_ACCOUNT' && { accountNumber: encrypt(accountNumber) }),
      ...(method === 'MOBILE_MONEY' && { mobileNumber: encrypt(mobileNumber) }),
      ...(method === 'PAYPAL' && { paypalEmail: encrypt(paypalEmail) }),
    },
  });

  if (existingMethod) {
    throw new ConflictError('This withdrawal method already exists');
  }

  // If setting as default, unset other defaults
  if (setAsDefault) {
    await prisma.withdrawalMethod.updateMany({
      where: { userId: sellerId },
      data: { isDefault: false },
    });
  }

  // Create withdrawal method with encrypted sensitive data
  const withdrawalMethod = await prisma.withdrawalMethod.create({
    data: {
      userId: sellerId,
      method,
      accountName,
      accountNumber: accountNumber ? encrypt(accountNumber) : null,
      bankName,
      bankCode,
      mobileProvider,
      mobileNumber: mobileNumber ? encrypt(mobileNumber) : null,
      paypalEmail: paypalEmail ? encrypt(paypalEmail) : null,
      isDefault: setAsDefault || false,
      metadata: {
        addedAt: new Date().toISOString(),
        ipAddress: req.ip,
      },
    },
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'WITHDRAWAL_METHOD_ADDED',
      entity: 'WithdrawalMethod',
      entityId: withdrawalMethod.id,
      metadata: { method, accountName },
    },
  });

  logger.info('Withdrawal method added', {
    userId: sellerId,
    methodId: withdrawalMethod.id,
    method,
  });

  res.status(201).json({
    success: true,
    message: 'Withdrawal method added successfully',
    data: {
      withdrawalMethod: {
        id: withdrawalMethod.id,
        method: withdrawalMethod.method,
        accountName: withdrawalMethod.accountName,
        isDefault: withdrawalMethod.isDefault,
        isVerified: withdrawalMethod.isVerified,
      },
    },
  });
};

/**
 * Process automated withdrawal
 */
export const processAutomatedWithdrawal = async (req, res) => {
  const sellerId = req.user.id;
  const withdrawalData = req.body;

  try {
    const withdrawal = await financeService.processAutomatedWithdrawal(sellerId, withdrawalData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: sellerId,
        action: 'AUTOMATED_WITHDRAWAL_PROCESSED',
        entity: 'Withdrawal',
        entityId: withdrawal.id,
        metadata: {
          amount: withdrawal.amount,
          priority: withdrawalData.priority
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Automated withdrawal processed successfully',
      data: withdrawal
    });
  } catch (error) {
    logger.error('Automated withdrawal failed:', { sellerId, withdrawalData, error: error.message });
    throw error;
  }
};

/**
 * Generate financial report
 */
export const generateFinancialReport = async (req, res) => {
  const sellerId = req.user.id;
  const reportConfig = req.body;

  try {
    const report = await financeService.generateFinancialReport(sellerId, reportConfig);

    res.status(200).json({
      success: true,
      message: 'Financial report generated successfully',
      data: report
    });
  } catch (error) {
    logger.error('Financial report generation failed:', { sellerId, reportConfig, error: error.message });
    throw error;
  }
};

/**
 * Update commission rates (Admin only)
 */
export const updateCommissionRates = async (req, res) => {
  const { sellerId } = req.params;
  const rateConfig = req.body;
  const adminId = req.user.id;

  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Only super admins can update commission rates');
  }

  try {
    const result = await financeService.updateCommissionRates(sellerId, rateConfig);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'COMMISSION_RATES_UPDATED',
        entity: 'CommissionRate',
        entityId: result.commissionRate.id,
        metadata: {
          sellerId,
          effectiveRates: result.effectiveRates
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Commission rates updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Commission rate update failed:', { sellerId, rateConfig, error: error.message });
    throw error;
  }
};

/**
 * Process bulk payouts (Admin only)
 */
export const processBulkPayouts = async (req, res) => {
  const payoutConfig = req.body;
  const adminId = req.user.id;

  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Only super admins can process bulk payouts');
  }

  try {
    const result = await financeService.processBulkPayouts(payoutConfig);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'BULK_PAYOUTS_PROCESSED',
        entity: 'BatchPayout',
        entityId: result.batchPayout.id,
        metadata: {
          batchId: result.batchPayout.batchId,
          sellerCount: result.batchPayout.sellerCount,
          totalAmount: result.batchPayout.totalAmount
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Bulk payouts processed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Bulk payout processing failed:', { payoutConfig, error: error.message });
    throw error;
  }
};

/**
 * Reconcile financial records (Admin only)
 */
export const reconcileFinancialRecords = async (req, res) => {
  const reconciliationConfig = req.body;
  const adminId = req.user.id;

  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Only super admins can reconcile financial records');
  }

  try {
    const result = await financeService.reconcileFinancialRecords(reconciliationConfig);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'FINANCIAL_RECONCILIATION_COMPLETED',
        entity: 'FinancialReconciliation',
        entityId: result.reconciliation.id,
        metadata: {
          reconciliationId: result.reconciliation.reconciliationId,
          discrepancies: result.discrepancies.length,
          status: result.reconciliation.status
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Financial reconciliation completed',
      data: result
    });
  } catch (error) {
    logger.error('Financial reconciliation failed:', { reconciliationConfig, error: error.message });
    throw error;
  }
};

/**
 * Get enhanced revenue analytics
 */
export const getEnhancedRevenueAnalytics = async (req, res) => {
  const sellerId = req.user.id;
  const { period = '30d', groupBy = 'day', includeProjections = false } = req.query;

  try {
    const analytics = await financeService.getRevenueAnalytics(sellerId, {
      period,
      groupBy,
      includeProjections: includeProjections === 'true'
    });

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Enhanced revenue analytics failed:', { sellerId, period, error: error.message });
    throw error;
  }
};

/**
 * Get withdrawal processing queue status (Admin only)
 */
export const getWithdrawalQueueStatus = async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Only super admins can view withdrawal queue status');
  }

  try {
    const queueStats = await financeService.getWithdrawalQueueStatus();

    res.status(200).json({
      success: true,
      data: queueStats
    });
  } catch (error) {
    logger.error('Withdrawal queue status failed:', { error: error.message });
    throw error;
  }
};

/**
 * Export financial data for accounting
 */
export const exportFinancialData = async (req, res) => {
  const sellerId = req.user.id;
  const { format = 'CSV', dateRange, includeTransactions = true } = req.body;

  try {
    const exportData = await financeService.exportFinancialData(sellerId, {
      format,
      dateRange,
      includeTransactions
    });

    res.setHeader('Content-Type', format === 'PDF' ? 'application/pdf' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="financial-export-${Date.now()}.${format.toLowerCase()}"`);

    if (format === 'CSV') {
      res.status(200).send(exportData.csvData);
    } else {
      res.status(200).send(exportData.pdfBuffer);
    }
  } catch (error) {
    logger.error('Financial data export failed:', { sellerId, format, error: error.message });
    throw error;
  }
};

/**
 * Remove withdrawal method
 */
export const removeWithdrawalMethod = async (req, res) => {
  const { methodId } = req.params;
  const sellerId = req.user.id;

  const method = await prisma.withdrawalMethod.findUnique({
    where: { id: methodId },
  });

  if (!method) {
    throw new NotFoundError('Withdrawal method');
  }

  if (method.userId !== sellerId) {
    throw new AuthorizationError('You can only remove your own withdrawal methods');
  }

  // Check if there are pending withdrawals using this method
  const pendingWithdrawals = await prisma.withdrawal.count({
    where: {
      methodId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
  });

  if (pendingWithdrawals > 0) {
    throw new ConflictError('Cannot remove method with pending withdrawals');
  }

  // Delete withdrawal method
  await prisma.withdrawalMethod.delete({
    where: { id: methodId },
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'WITHDRAWAL_METHOD_REMOVED',
      entity: 'WithdrawalMethod',
      entityId: methodId,
    },
  });

  logger.info('Withdrawal method removed', {
    userId: sellerId,
    methodId,
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal method removed successfully',
  });
};

/**
 * Request withdrawal
 */
export const requestWithdrawal = async (req, res) => {
  const sellerId = req.user.id;
  const { amount, methodId } = req.body;

  // Validate amount
  if (!amount || amount <= 0) {
    throw new ValidationError('Invalid withdrawal amount');
  }

  // Minimum withdrawal amount
  const minWithdrawal = 10;
  if (amount < minWithdrawal) {
    throw new ValidationError(`Minimum withdrawal amount is $${minWithdrawal}`);
  }

  // Get finance record
  const finance = await prisma.finance.findUnique({
    where: { sellerId },
  });

  if (!finance) {
    throw new NotFoundError('Finance record not found');
  }

  // Check available balance
  if (amount > finance.availableBalance) {
    throw new ValidationError(`Insufficient balance. Available: $${finance.availableBalance}`);
  }

  // Get withdrawal method
  const withdrawalMethod = await prisma.withdrawalMethod.findUnique({
    where: { id: methodId },
  });

  if (!withdrawalMethod) {
    throw new NotFoundError('Withdrawal method');
  }

  if (withdrawalMethod.userId !== sellerId) {
    throw new AuthorizationError('Invalid withdrawal method');
  }

  if (!withdrawalMethod.isVerified) {
    throw new ValidationError('Withdrawal method is not verified');
  }

  // Calculate withdrawal fee (2% or minimum $1)
  const feePercentage = 0.02;
  const minFee = 1;
  const fee = Math.max(amount * feePercentage, minFee);
  const netAmount = amount - fee;

  // Create withdrawal request
  const withdrawal = await prisma.$transaction(async (tx) => {
    // Create withdrawal
    const newWithdrawal = await tx.withdrawal.create({
      data: {
        financeId: finance.id,
        methodId,
        amount,
        fee,
        netAmount,
        status: 'PENDING',
        reference: generateUniqueId('WTH'),
        metadata: {
          requestedAt: new Date().toISOString(),
          ipAddress: req.ip,
        },
      },
    });

    // Update finance balances
    await tx.finance.update({
      where: { id: finance.id },
      data: {
        availableBalance: { decrement: amount },
        pendingBalance: { increment: amount },
      },
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
        description: `Withdrawal request to ${withdrawalMethod.method}`,
      },
    });

    return newWithdrawal;
  });

  // Queue withdrawal processing
  await financeQueue.processWithdrawal({
    withdrawalId: withdrawal.id,
    sellerId,
    amount,
    methodId,
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'WITHDRAWAL_REQUESTED',
      entity: 'Withdrawal',
      entityId: withdrawal.id,
      metadata: {
        amount,
        fee,
        netAmount,
        method: withdrawalMethod.method,
      },
    },
  });

  logger.info('Withdrawal requested', {
    userId: sellerId,
    withdrawalId: withdrawal.id,
    amount,
    netAmount,
  });

  res.status(201).json({
    success: true,
    message: 'Withdrawal request submitted successfully',
    data: {
      withdrawal: {
        id: withdrawal.id,
        reference: withdrawal.reference,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netAmount: withdrawal.netAmount,
        status: withdrawal.status,
      },
    },
  });
};

/**
 * Get withdrawal history
 */
export const getWithdrawalHistory = async (req, res) => {
  const sellerId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  // Get finance record
  const finance = await prisma.finance.findUnique({
    where: { sellerId },
  });

  if (!finance) {
    throw new NotFoundError('Finance record not found');
  }

  const skip = (page - 1) * limit;

  const where = {
    financeId: finance.id,
    ...(status && { status }),
  };

  const [withdrawals, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        method: {
          select: {
            method: true,
            accountName: true,
          },
        },
      },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      withdrawals,
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
 * Get transaction history
 */
export const getTransactionHistory = async (req, res) => {
  const sellerId = req.user.id;
  const { type, page = 1, limit = 50, startDate, endDate } = req.query;

  const skip = (page - 1) * limit;

  const where = {
    userId: sellerId,
    ...(type && { type }),
    ...(startDate && endDate && {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    }),
  };

  const [transactions, total, summary] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          select: {
            booking: {
              select: {
                bookingRef: true,
                campaign: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      summary,
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
 * Get revenue analytics
 */
export const getRevenueAnalytics = async (req, res) => {
  const sellerId = req.user.id;
  const { period = '30d', groupBy = 'day' } = req.query;

  // Calculate date range
  let startDate;
  switch (period) {
    case '7d':
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get revenue data grouped by period
  let revenueData;
  if (groupBy === 'day') {
    revenueData = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END) as revenue,
        SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as refunds,
        SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
        COUNT(CASE WHEN type = 'SALE' THEN 1 END) as sales_count
      FROM transactions
      WHERE user_id = ${sellerId}
        AND created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
  } else if (groupBy === 'week') {
    revenueData = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END) as revenue,
        SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as refunds,
        SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
        COUNT(CASE WHEN type = 'SALE' THEN 1 END) as sales_count
      FROM transactions
      WHERE user_id = ${sellerId}
        AND created_at >= ${startDate}
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
    `;
  } else {
    revenueData = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END) as revenue,
        SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as refunds,
        SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
        COUNT(CASE WHEN type = 'SALE' THEN 1 END) as sales_count
      FROM transactions
      WHERE user_id = ${sellerId}
        AND created_at >= ${startDate}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `;
  }

  // Get top performing campaigns
  const topCampaigns = await prisma.$queryRaw`
    SELECT 
      tc.id,
      tc.title,
      COUNT(DISTINCT b.id) as bookings,
      SUM(t.amount) as revenue
    FROM ticket_campaigns tc
    JOIN bookings b ON b.campaign_id = tc.id
    JOIN payments p ON p.booking_id = b.id
    JOIN transactions t ON t.payment_id = p.id
    WHERE tc.seller_id = ${sellerId}
      AND t.type = 'SALE'
      AND t.created_at >= ${startDate}
    GROUP BY tc.id, tc.title
    ORDER BY revenue DESC
    LIMIT 5
  `;

  // Get summary statistics
  const summary = await prisma.transaction.aggregate({
    where: {
      userId: sellerId,
      createdAt: { gte: startDate },
    },
    _sum: {
      amount: true,
    },
    _count: {
      id: true,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      period,
      groupBy,
      revenue: revenueData,
      topCampaigns,
      summary: {
        totalRevenue: summary._sum.amount || 0,
        totalTransactions: summary._count.id || 0,
        averageTransaction: summary._count.id > 0 
          ? (summary._sum.amount / summary._count.id).toFixed(2)
          : 0,
      },
    },
  });
};

/**
 * Verify withdrawal method (Admin action)
 */
export const verifyWithdrawalMethod = async (req, res) => {
  const { methodId } = req.params;
  const adminId = req.user.id;

  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Only super admins can verify withdrawal methods');
  }

  const method = await prisma.withdrawalMethod.findUnique({
    where: { id: methodId },
  });

  if (!method) {
    throw new NotFoundError('Withdrawal method');
  }

  if (method.isVerified) {
    throw new ConflictError('Method already verified');
  }

  // Update verification status
  const updatedMethod = await prisma.withdrawalMethod.update({
    where: { id: methodId },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      metadata: {
        ...method.metadata,
        verifiedBy: adminId,
        verificationDate: new Date().toISOString(),
      },
    },
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'WITHDRAWAL_METHOD_VERIFIED',
      entity: 'WithdrawalMethod',
      entityId: methodId,
    },
  });

  logger.info('Withdrawal method verified', {
    adminId,
    methodId,
    userId: method.userId,
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal method verified successfully',
    data: {
      method: {
        id: updatedMethod.id,
        isVerified: updatedMethod.isVerified,
        verifiedAt: updatedMethod.verifiedAt,
      },
    },
  });
};