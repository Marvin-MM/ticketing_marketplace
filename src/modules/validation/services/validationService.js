import prisma from '../../../config/database.js';
import { cache, lock } from '../../../config/redis.js';
import { emailQueue } from '../../../config/rabbitmq.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';
import { verifyQRData, generateSecureToken, encrypt, decrypt } from '../../../shared/utils/encryption.js';
import { 
  ValidationError, 
  NotFoundError,
  AuthorizationError,
  ConflictError
} from '../../../shared/errors/AppError.js';

/**
 * Enhanced Validation Service with comprehensive security and fraud detection
 */
class ValidationService {
  /**
   * Enhanced QR code validation with fraud detection
   */
  async validateTicketQR(qrData, validatorInfo, context = {}) {
    const { location, ipAddress, userAgent, deviceFingerprint } = context;
    const { managerId, userId, validatorType } = validatorInfo;

    try {
      // Enhanced QR verification with security checks
      const verification = await this._verifyQRCodeSecurity(qrData, context);
      
      if (!verification.valid) {
        await this._logSecurityEvent('QR_VERIFICATION_FAILED', verification.threat, context);
        return {
          valid: false,
          reason: verification.reason,
          securityAlert: verification.threat?.level || 'LOW'
        };
      }

      const { ticketId, ticketNumber, campaignId, securityHash } = verification.data;

      // Fraud detection checks
      const fraudCheck = await this._performFraudDetection(ticketId, context);
      if (fraudCheck.suspicious) {
        await this._handleSuspiciousActivity(ticketId, fraudCheck, context);
        return {
          valid: false,
          reason: 'Validation blocked due to suspicious activity',
          securityAlert: 'HIGH',
          fraudScore: fraudCheck.score
        };
      }

      // Acquire validation lock
      const lockKey = `validation:${ticketId}`;
      const lockToken = await lock.acquire(lockKey, 10);
      
      if (!lockToken) {
        throw new ConflictError('Validation in progress. Please wait and try again.');
      }

      try {
        // Enhanced validation processing
        const result = await this._processTicketValidation(
          ticketId,
          ticketNumber,
          campaignId,
          validatorInfo,
          context,
          fraudCheck
        );

        await lock.release(lockKey, lockToken);

        // Queue post-validation processes
        await this._queuePostValidationTasks(result, context);

        return result;

      } catch (error) {
        await lock.release(lockKey, lockToken);
        throw error;
      }

    } catch (error) {
      logger.error('Enhanced validation failed:', {
        ticketId: verification?.data?.ticketId,
        validatorId: managerId || userId,
        error: error.message,
        context
      });
      throw error;
    }
  }

  /**
   * Bulk validation for event entry processing
   */
  async processBulkValidation(validationRequests, validatorInfo, context = {}) {
    const { batchSize = 50 } = context;
    const results = [];
    const errors = [];

    try {
      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < validationRequests.length; i += batchSize) {
        const batch = validationRequests.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(request => 
            this.validateTicketQR(request.qrData, validatorInfo, {
              ...context,
              batchIndex: Math.floor(i / batchSize),
              requestIndex: i + batch.indexOf(request)
            })
          )
        );

        // Collect results and errors
        batchResults.forEach((result, index) => {
          const requestIndex = i + index;
          if (result.status === 'fulfilled') {
            results.push({
              index: requestIndex,
              ...result.value
            });
          } else {
            errors.push({
              index: requestIndex,
              error: result.reason.message || 'Validation failed'
            });
          }
        });

        // Small delay between batches to prevent overwhelming
        if (i + batchSize < validationRequests.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const summary = {
        total: validationRequests.length,
        successful: results.filter(r => r.valid).length,
        failed: results.filter(r => !r.valid).length + errors.length,
        suspicious: results.filter(r => r.securityAlert === 'HIGH').length
      };

      logger.info('Bulk validation completed', {
        validatorId: validatorInfo.managerId || validatorInfo.userId,
        summary,
        batchCount: Math.ceil(validationRequests.length / batchSize)
      });

      return {
        summary,
        results,
        errors,
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('Bulk validation failed:', {
        validatorId: validatorInfo.managerId || validatorInfo.userId,
        totalRequests: validationRequests.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enhanced offline validation with conflict resolution
   */
  async processOfflineValidations(offlineValidations, managerId) {
    const results = {
      processed: [],
      conflicts: [],
      errors: []
    };

    try {
      for (const validation of offlineValidations) {
        try {
          const result = await this._processOfflineValidation(validation, managerId);
          results.processed.push(result);
        } catch (error) {
          if (error instanceof ConflictError) {
            results.conflicts.push({
              validation,
              conflict: error.message
            });
          } else {
            results.errors.push({
              validation,
              error: error.message
            });
          }
        }
      }

      // Handle conflicts with automated resolution where possible
      if (results.conflicts.length > 0) {
        const resolvedConflicts = await this._resolveValidationConflicts(results.conflicts);
        results.resolved = resolvedConflicts;
      }

      logger.info('Offline validation sync completed', {
        managerId,
        processed: results.processed.length,
        conflicts: results.conflicts.length,
        errors: results.errors.length
      });

      return results;

    } catch (error) {
      logger.error('Offline validation sync failed:', {
        managerId,
        totalValidations: offlineValidations.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get validation queue status and metrics
   */
  async getValidationQueueStatus(filters = {}) {
    const { campaignId, managerId, timeRange = '1h' } = filters;

    try {
      const timeRangeMs = this._parseTimeRange(timeRange);
      const since = new Date(Date.now() - timeRangeMs);

      const [
        queueMetrics,
        activeValidations,
        failureRates,
        throughputMetrics,
        securityAlerts
      ] = await Promise.all([
        this._getQueueMetrics(since, { campaignId, managerId }),
        this._getActiveValidations({ campaignId, managerId }),
        this._getFailureRates(since, { campaignId, managerId }),
        this._getThroughputMetrics(since, { campaignId, managerId }),
        this._getSecurityAlerts(since, { campaignId, managerId })
      ]);

      return {
        queue: queueMetrics,
        active: activeValidations,
        failures: failureRates,
        throughput: throughputMetrics,
        security: securityAlerts,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Queue status retrieval failed:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Geofencing validation check
   */
  async validateLocationAccess(ticketId, location, campaignId) {
    try {
      // Get campaign geofencing settings
      const campaign = await prisma.ticketCampaign.findUnique({
        where: { id: campaignId },
        select: {
          metadata: true,
          venue: true,
          venueAddress: true
        }
      });

      if (!campaign?.metadata?.geofencing) {
        return { allowed: true, reason: 'No geofencing configured' };
      }

      const geofencingConfig = campaign.metadata.geofencing;
      const { latitude, longitude } = location;

      // Check if validation is within allowed radius
      const distance = this._calculateDistance(
        latitude,
        longitude,
        geofencingConfig.centerLat,
        geofencingConfig.centerLng
      );

      const allowed = distance <= geofencingConfig.radiusMeters;

      if (!allowed) {
        await this._logSecurityEvent('GEOFENCING_VIOLATION', {
          ticketId,
          campaignId,
          distance,
          allowedRadius: geofencingConfig.radiusMeters,
          location
        });
      }

      return {
        allowed,
        distance,
        maxDistance: geofencingConfig.radiusMeters,
        reason: allowed ? 'Within allowed area' : 'Outside validation area'
      };

    } catch (error) {
      logger.error('Geofencing validation failed:', {
        ticketId,
        campaignId,
        location,
        error: error.message
      });
      return { allowed: true, reason: 'Geofencing check failed - allowing access' };
    }
  }

  // Private helper methods
  async _verifyQRCodeSecurity(qrData, context) {
    try {
      // Basic QR verification
      const basicVerification = verifyQRData(qrData);
      if (!basicVerification.valid) {
        return basicVerification;
      }

      // Enhanced security checks
      const securityChecks = await this._performSecurityChecks(basicVerification.data, context);
      
      return {
        valid: securityChecks.passed,
        data: basicVerification.data,
        reason: securityChecks.reason,
        threat: securityChecks.threat
      };

    } catch (error) {
      return {
        valid: false,
        reason: 'QR verification failed',
        threat: { level: 'HIGH', type: 'VERIFICATION_ERROR' }
      };
    }
  }

  async _performSecurityChecks(qrData, context) {
    const checks = {
      timestamp: this._checkTimestamp(qrData),
      tampering: await this._checkTampering(qrData),
      rateLimit: await this._checkRateLimit(context),
      deviceFingerprint: await this._checkDeviceFingerprint(context)
    };

    const failedChecks = Object.entries(checks).filter(([_, result]) => !result.passed);
    
    if (failedChecks.length > 0) {
      const threatLevel = failedChecks.some(([_, result]) => result.severity === 'HIGH') ? 'HIGH' : 'MEDIUM';
      
      return {
        passed: false,
        reason: failedChecks.map(([check, result]) => `${check}: ${result.reason}`).join('; '),
        threat: {
          level: threatLevel,
          type: 'SECURITY_CHECK_FAILED',
          details: failedChecks
        }
      };
    }

    return { passed: true };
  }

  async _performFraudDetection(ticketId, context) {
    const checks = await Promise.all([
      this._checkRepeatedAttempts(ticketId, context),
      this._checkVelocityFraud(context),
      this._checkLocationFraud(ticketId, context),
      this._checkDeviceFraud(context),
      this._checkTimingFraud(ticketId, context)
    ]);

    const score = checks.reduce((total, check) => total + check.score, 0);
    const maxScore = checks.length * 100;
    const normalizedScore = (score / maxScore) * 100;

    const suspicious = normalizedScore > 70; // Threshold for suspicious activity
    
    return {
      suspicious,
      score: normalizedScore,
      checks,
      recommendation: this._getFraudRecommendation(normalizedScore)
    };
  }

  async _processTicketValidation(ticketId, ticketNumber, campaignId, validatorInfo, context, fraudCheck) {
    return await prisma.$transaction(async (tx) => {
      // Get ticket with all necessary data
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              eventDate: true,
              venue: true,
              venueAddress: true,
              isMultiScan: true,
              maxScansPerTicket: true,
              sellerId: true,
              metadata: true
            }
          },
          booking: {
            select: {
              id: true,
              bookingRef: true,
              customer: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!ticket) {
        throw new NotFoundError('Ticket not found');
      }

      // Verify authorization
      await this._verifyValidatorAuthorization(validatorInfo, ticket.campaign.sellerId, tx);

      // Perform validation checks
      const validationResult = await this._performValidationChecks(ticket, context);
      if (!validationResult.valid) {
        return validationResult;
      }

      // Update ticket status
      const updatedTicket = await this._updateTicketStatus(ticket, tx);

      // Create validation log
      const validation = await tx.ticketValidation.create({
        data: {
          ticketId,
          campaignId,
          validatedBy: validatorInfo.managerId || null,
          validatedByUser: validatorInfo.userId || null,
          validationMethod: context.method || 'QR_SCAN',
          scanNumber: updatedTicket.scanCount,
          location: context.location,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          isValid: true,
          metadata: {
            validatorType: validatorInfo.validatorType,
            fraudScore: fraudCheck.score,
            securityChecks: context.securityChecks,
            deviceFingerprint: context.deviceFingerprint,
            geolocation: context.geolocation,
            timestamp: new Date().toISOString()
          }
        }
      });

      // Update campaign analytics
      await this._updateValidationAnalytics(campaignId, validation, tx);

      return {
        valid: true,
        ticket: updatedTicket,
        campaign: ticket.campaign,
        customer: ticket.booking.customer,
        validation,
        message: this._getSuccessMessage(updatedTicket)
      };
    });
  }

  async _handleSuspiciousActivity(ticketId, fraudCheck, context) {
    // Create security alert
    await prisma.securityAlert.create({
      data: {
        type: 'SUSPICIOUS_VALIDATION',
        severity: fraudCheck.score > 90 ? 'CRITICAL' : 'HIGH',
        ticketId,
        metadata: {
          fraudScore: fraudCheck.score,
          checks: fraudCheck.checks,
          context,
          timestamp: new Date().toISOString()
        }
      }
    });

    // Notify security team for high-risk events
    if (fraudCheck.score > 90) {
      await emailQueue.sendSecurityAlert({
        type: 'CRITICAL_FRAUD_ATTEMPT',
        ticketId,
        fraudScore: fraudCheck.score,
        context
      });
    }

    logger.security('Suspicious validation activity detected', null, context.ipAddress, context.userAgent, {
      ticketId,
      fraudScore: fraudCheck.score,
      checks: fraudCheck.checks
    });
  }

  async _processOfflineValidation(validation, managerId) {
    // Check if validation already exists
    const existing = await prisma.ticketValidation.findFirst({
      where: {
        ticketId: validation.ticketId,
        createdAt: {
          gte: new Date(validation.timestamp - 60000), // 1 minute tolerance
          lte: new Date(validation.timestamp + 60000)
        }
      }
    });

    if (existing) {
      throw new ConflictError(`Validation already exists for ticket ${validation.ticketId} at ${validation.timestamp}`);
    }

    // Create validation record
    return await prisma.ticketValidation.create({
      data: {
        ticketId: validation.ticketId,
        campaignId: validation.campaignId,
        validatedBy: managerId,
        validationMethod: 'OFFLINE',
        scanNumber: validation.scanNumber,
        location: validation.location,
        isValid: validation.isValid,
        createdAt: new Date(validation.timestamp),
        metadata: {
          ...validation.metadata,
          syncedAt: new Date().toISOString(),
          offlineValidation: true
        }
      }
    });
  }

  _parseTimeRange(timeRange) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['1h'];
  }

  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  async _logSecurityEvent(eventType, details, context = {}) {
    await prisma.securityLog.create({
      data: {
        eventType,
        details,
        context,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        timestamp: new Date()
      }
    });
  }

  _getSuccessMessage(ticket) {
    const { scanCount, maxScans } = ticket;
    if (maxScans === 1) {
      return 'Ticket validated successfully';
    }
    return `Ticket validated successfully (Scan ${scanCount}/${maxScans})`;
  }

  _getFraudRecommendation(score) {
    if (score < 30) return 'ALLOW';
    if (score < 70) return 'REVIEW';
    return 'BLOCK';
  }

  // Additional helper methods would continue here...
  // For brevity, I'm showing the structure and key methods
}

export default new ValidationService();