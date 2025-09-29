import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import { cache, lock } from '../../../config/redis.js';
import validationService from '../services/validationService.js';
import validationAnalyticsService from '../services/validationAnalyticsService.js';
import { 
  ValidationError, 
  NotFoundError,
  AuthorizationError 
} from '../../../shared/errors/AppError.js';
import { verifyQRData, verifyPassword } from '../../../shared/utils/encryption.js';

/**
 * Enhanced QR code validation using validation service
 */
export const validateQRCode = async (req, res) => {
  const { qrData, location, deviceFingerprint, geolocation } = req.body;
  const validatorInfo = {
    managerId: req.managerId,
    userId: req.user?.id,
    validatorType: req.managerId ? 'MANAGER' : 'USER'
  };
  
  const context = {
    location,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    deviceFingerprint,
    geolocation,
    method: 'QR_SCAN'
  };

  if (!qrData) {
    throw new ValidationError('QR code data is required');
  }

  try {
    const result = await validationService.validateTicketQR(qrData, validatorInfo, context);
    
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: result.reason,
        securityAlert: result.securityAlert,
        fraudScore: result.fraudScore
      });
    }

    // Prepare success response
    const response = {
      success: true,
      valid: true,
      message: result.message,
      data: {
        ticket: {
          id: result.ticket.id,
          ticketNumber: result.ticket.ticketNumber,
          status: result.ticket.status,
          scanCount: result.ticket.scanCount,
          maxScans: result.ticket.maxScans,
          remainingScans: Math.max(0, result.ticket.maxScans - result.ticket.scanCount)
        },
        campaign: {
          title: result.campaign.title,
          venue: result.campaign.venue,
          eventDate: result.campaign.eventDate
        },
        customer: result.customer,
        validationId: result.validation.id
      }
    };

    res.status(200).json(response);
    
  } catch (error) {
    logger.error('QR validation failed:', { 
      validatorId: validatorInfo.managerId || validatorInfo.userId,
      error: error.message, 
      context 
    });
    throw error;
  }
};

/**
 * Manager login for validation app
 */
export const managerLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const manager = await prisma.manager.findUnique({
    where: { email },
    include: {
      seller: {
        select: {
          id: true,
          email: true,
          sellerApplication: {
            select: {
              businessName: true,
            },
          },
        },
      },
    },
  });

  if (!manager) {
    throw new ValidationError('Invalid credentials');
  }

  if (!manager.isActive) {
    throw new ValidationError('Manager account is deactivated');
  }

  // Verify password
  const isValidPassword = verifyPassword(password, manager.password);
  
  if (!isValidPassword) {
    // Log failed login attempt
    logger.security('Failed manager login attempt', null, req.ip, req.get('user-agent'), {
      email,
    });
    throw new ValidationError('Invalid credentials');
  }

  // Update last active time
  await prisma.manager.update({
    where: { id: manager.id },
    data: { lastActiveAt: new Date() },
  });

  // Log successful login
  logger.info('Manager logged in', {
    managerId: manager.id,
    email: manager.email,
    sellerId: manager.sellerId,
  });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        permissions: manager.permissions,
      },
      seller: {
        id: manager.seller.id,
        businessName: manager.seller.sellerApplication?.businessName,
      },
    },
  });
};

/**
 * Get validation history for a campaign
 */
export const getValidationHistory = async (req, res) => {
  const { campaignId } = req.params;
  const { page = 1, limit = 50, date } = req.query;
  const userId = req.user.id;

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== userId && req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Not authorized to view validation history');
  }

  const skip = (page - 1) * limit;

  // Build where clause
  const where = {
    campaignId,
    ...(date && {
      createdAt: {
        gte: new Date(date),
        lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
      },
    }),
  };

  const [validations, total] = await Promise.all([
    prisma.ticketValidation.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        ticket: {
          select: {
            ticketNumber: true,
            ticketType: true,
            booking: {
              select: {
                bookingRef: true,
                customer: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.ticketValidation.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      validations,
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
 * Get validation statistics for a campaign
 */
export const getValidationStats = async (req, res) => {
  const { campaignId } = req.params;
  const userId = req.user.id;

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== userId && req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Not authorized to view validation statistics');
  }

  // Get validation statistics
  const [
    totalValidations,
    uniqueTicketsValidated,
    validationsByHour,
    validationsByType,
    scanDistribution,
  ] = await Promise.all([
    // Total validations
    prisma.ticketValidation.count({
      where: { campaignId, isValid: true },
    }),

    // Unique tickets validated
    prisma.ticket.count({
      where: { 
        campaignId,
        scanCount: { gt: 0 },
      },
    }),

    // Validations by hour (last 24 hours)
    prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as count
      FROM ticket_validations
      WHERE campaign_id = ${campaignId}
        AND is_valid = true
        AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour DESC
    `,

    // Validations by ticket type
    prisma.$queryRaw`
      SELECT 
        t.ticket_type,
        COUNT(v.id) as validation_count,
        COUNT(DISTINCT t.id) as unique_tickets
      FROM ticket_validations v
      JOIN tickets t ON v.ticket_id = t.id
      WHERE v.campaign_id = ${campaignId}
        AND v.is_valid = true
      GROUP BY t.ticket_type
    `,

    // Scan distribution for multi-scan tickets
    campaign.isMultiScan ? prisma.$queryRaw`
      SELECT 
        scan_count,
        COUNT(*) as ticket_count
      FROM tickets
      WHERE campaign_id = ${campaignId}
      GROUP BY scan_count
      ORDER BY scan_count
    ` : [],
  ]);

  // Calculate validation rate
  const validationRate = campaign._count.tickets > 0
    ? ((uniqueTicketsValidated / campaign._count.tickets) * 100).toFixed(2)
    : 0;

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalTickets: campaign._count.tickets,
        totalValidations,
        uniqueTicketsValidated,
        validationRate: `${validationRate}%`,
        remainingTickets: campaign._count.tickets - uniqueTicketsValidated,
      },
      hourlyTrend: validationsByHour,
      byTicketType: validationsByType,
      scanDistribution: campaign.isMultiScan ? scanDistribution : null,
    },
  });
};

/**
 * Manual ticket validation (without QR code)
 */
export const manualValidation = async (req, res) => {
  const { ticketNumber, location } = req.body;
  const validatorId = req.user.id;

  if (!ticketNumber) {
    throw new ValidationError('Ticket number is required');
  }

  // Find ticket by number
  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    include: {
      campaign: {
        select: {
          sellerId: true,
          title: true,
          isMultiScan: true,
          maxScansPerTicket: true,
        },
      },
      booking: {
        select: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket not found');
  }

  // Verify ownership
  if (ticket.campaign.sellerId !== validatorId && req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Not authorized to validate this ticket');
  }

  // Use the same validation logic as QR code validation
  req.body.qrData = ticket.qrCode;
  return validateQRCode(req, res);
};

/**
 * Get offline validation data for sync
 */
export const getOfflineData = async (req, res) => {
  const managerId = req.managerId;

  if (!managerId) {
    throw new AuthorizationError('Manager authentication required');
  }

  // Get manager's seller campaigns
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { sellerId: true },
  });

  if (!manager) {
    throw new NotFoundError('Manager');
  }

  // Get active campaigns for the seller
  const campaigns = await prisma.ticketCampaign.findMany({
    where: {
      sellerId: manager.sellerId,
      status: 'ACTIVE',
      eventDate: {
        gte: new Date(),
        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
      },
    },
    select: {
      id: true,
      title: true,
      eventDate: true,
      venue: true,
    },
  });

  // Get basic ticket data for offline validation
  const tickets = await prisma.ticket.findMany({
    where: {
      campaignId: { in: campaigns.map(c => c.id) },
      status: { in: ['VALID', 'USED'] },
    },
    select: {
      id: true,
      ticketNumber: true,
      qrSecurityKey: true,
      status: true,
      scanCount: true,
      maxScans: true,
      campaignId: true,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      campaigns,
      tickets,
      syncedAt: new Date().toISOString(),
    },
  });
};

/**
 * Bulk validation processing for high-volume entry scenarios
 */
export const bulkValidation = async (req, res) => {
  const { validationRequests, batchSize } = req.body;
  const validatorInfo = {
    managerId: req.managerId,
    userId: req.user?.id,
    validatorType: req.managerId ? 'MANAGER' : 'USER'
  };
  
  const context = {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    method: 'BULK_SCAN',
    batchSize: batchSize || 50
  };

  if (!validationRequests || !Array.isArray(validationRequests)) {
    throw new ValidationError('Invalid validation requests format');
  }

  if (validationRequests.length === 0) {
    throw new ValidationError('No validation requests provided');
  }

  if (validationRequests.length > 500) {
    throw new ValidationError('Batch size too large. Maximum 500 validations per request');
  }

  try {
    const result = await validationService.processBulkValidation(
      validationRequests,
      validatorInfo,
      context
    );

    res.status(200).json({
      success: true,
      message: `Processed ${result.summary.total} validation requests`,
      data: {
        summary: result.summary,
        results: result.results,
        errors: result.errors,
        processedAt: result.processedAt
      }
    });
    
  } catch (error) {
    logger.error('Bulk validation failed:', {
      validatorId: validatorInfo.managerId || validatorInfo.userId,
      requestCount: validationRequests.length,
      error: error.message
    });
    throw error;
  }
};

/**
 * Process offline validation sync
 */
export const syncOfflineValidations = async (req, res) => {
  const { offlineValidations } = req.body;
  const managerId = req.managerId;

  if (!managerId) {
    throw new AuthorizationError('Manager authentication required for offline sync');
  }

  if (!offlineValidations || !Array.isArray(offlineValidations)) {
    throw new ValidationError('Invalid offline validations format');
  }

  try {
    const result = await validationService.processOfflineValidations(
      offlineValidations,
      managerId
    );

    res.status(200).json({
      success: true,
      message: `Synced ${result.processed.length} offline validations`,
      data: {
        processed: result.processed.length,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
        details: result
      }
    });
    
  } catch (error) {
    logger.error('Offline validation sync failed:', {
      managerId,
      validationCount: offlineValidations.length,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get validation dashboard analytics
 */
export const getValidationDashboard = async (req, res) => {
  const { campaignId, timeRange, includeComparison } = req.query;
  const userId = req.user.id;
  const managerId = req.managerId;

  const filters = {
    campaignId,
    sellerId: userId,
    managerId,
    timeRange: timeRange || '24h',
    includeComparison: includeComparison === 'true'
  };

  try {
    const dashboard = await validationAnalyticsService.getValidationDashboard(filters);

    res.status(200).json({
      success: true,
      data: dashboard
    });
    
  } catch (error) {
    logger.error('Dashboard generation failed:', { 
      filters,
      userId,
      managerId,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get campaign validation analytics
 */
export const getCampaignAnalytics = async (req, res) => {
  const { campaignId } = req.params;
  const { timeRange, includeHourly } = req.query;
  const userId = req.user.id;

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true }
  });

  if (!campaign) {
    throw new NotFoundError('Campaign not found');
  }

  if (campaign.sellerId !== userId && req.user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Not authorized to view campaign analytics');
  }

  const filters = {
    timeRange: timeRange || '7d',
    includeHourly: includeHourly === 'true'
  };

  try {
    const analytics = await validationAnalyticsService.getCampaignValidationAnalytics(
      campaignId,
      filters
    );

    res.status(200).json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    logger.error('Campaign analytics failed:', { 
      campaignId,
      userId,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get fraud detection report
 */
export const getFraudDetectionReport = async (req, res) => {
  const { campaignId, timeRange, severity, includeResolved } = req.query;
  const userId = req.user.id;

  const filters = {
    campaignId,
    sellerId: userId,
    timeRange: timeRange || '7d',
    severity: severity || 'ALL',
    includeResolved: includeResolved === 'true'
  };

  try {
    const report = await validationAnalyticsService.getFraudDetectionReport(filters);

    res.status(200).json({
      success: true,
      data: report
    });
    
  } catch (error) {
    logger.error('Fraud detection report failed:', { 
      filters,
      userId,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get validator performance report
 */
export const getValidatorPerformanceReport = async (req, res) => {
  const { managerId, campaignId, timeRange, includeComparison } = req.query;
  const userId = req.user.id;
  const currentManagerId = req.managerId;

  const filters = {
    managerId: managerId || currentManagerId,
    campaignId,
    sellerId: userId,
    timeRange: timeRange || '7d',
    includeComparison: includeComparison === 'true'
  };

  try {
    const report = await validationAnalyticsService.getValidatorPerformanceReport(filters);

    res.status(200).json({
      success: true,
      data: report
    });
    
  } catch (error) {
    logger.error('Validator performance report failed:', { 
      filters,
      userId,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get real-time validation queue status
 */
export const getQueueStatus = async (req, res) => {
  const { campaignId } = req.query;
  const userId = req.user.id;
  const managerId = req.managerId;

  const filters = {
    campaignId,
    sellerId: userId,
    managerId
  };

  try {
    const status = await validationService.getValidationQueueStatus(filters);

    res.status(200).json({
      success: true,
      data: status
    });
    
  } catch (error) {
    logger.error('Queue status retrieval failed:', { 
      filters,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get queue insights and predictions
 */
export const getQueueInsights = async (req, res) => {
  const { campaignId } = req.query;
  const userId = req.user.id;
  const managerId = req.managerId;

  const filters = {
    campaignId,
    sellerId: userId,
    managerId
  };

  try {
    const insights = await validationAnalyticsService.getValidationQueueInsights(filters);

    res.status(200).json({
      success: true,
      data: insights
    });
    
  } catch (error) {
    logger.error('Queue insights failed:', { 
      filters,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Validate location access using geofencing
 */
export const validateLocationAccess = async (req, res) => {
  const { ticketId, location, campaignId } = req.body;

  if (!ticketId || !location || !campaignId) {
    throw new ValidationError('Ticket ID, location, and campaign ID are required');
  }

  if (!location.latitude || !location.longitude) {
    throw new ValidationError('Location coordinates are required');
  }

  try {
    const result = await validationService.validateLocationAccess(
      ticketId,
      location,
      campaignId
    );

    res.status(200).json({
      success: true,
      data: {
        allowed: result.allowed,
        reason: result.reason,
        distance: result.distance,
        maxDistance: result.maxDistance
      }
    });
    
  } catch (error) {
    logger.error('Location validation failed:', { 
      ticketId,
      campaignId,
      location,
      error: error.message 
    });
    throw error;
  }
};

/**
 * Export validation analytics report
 */
export const exportAnalyticsReport = async (req, res) => {
  const { reportType, format, campaignId, timeRange } = req.query;
  const userId = req.user.id;

  const filters = {
    reportType: reportType || 'COMPREHENSIVE',
    campaignId,
    sellerId: userId,
    timeRange: timeRange || '30d'
  };

  try {
    const report = await validationAnalyticsService.exportAnalyticsReport(
      filters,
      format || 'JSON'
    );

    if (format === 'CSV') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=validation-report.csv');
      res.send(report);
    } else if (format === 'PDF') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=validation-report.pdf');
      res.send(report);
    } else {
      res.status(200).json({
        success: true,
        data: report
      });
    }
    
  } catch (error) {
    logger.error('Report export failed:', { 
      filters,
      format,
      error: error.message 
    });
    throw error;
  }
};
