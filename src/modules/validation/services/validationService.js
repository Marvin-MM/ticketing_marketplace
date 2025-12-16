// import prisma from '../../../config/database.js';
// import { cache, lock } from '../../../config/redis.js';
// import { emailQueue } from '../../../config/rabbitmq.js';
// import logger from '../../../config/logger.js';
// import config from '../../../config/index.js';
// import { verifyQRData, generateSecureToken, encrypt, decrypt } from '../../../shared/utils/encryption.js';
// import { 
//   ValidationError, 
//   NotFoundError,
//   AuthorizationError,
//   ConflictError
// } from '../../../shared/errors/AppError.js';

// /**
//  * Enhanced Validation Service with comprehensive security and fraud detection
//  */
// class ValidationService {
//   /**
//    * Enhanced QR code validation with fraud detection
//    */
//   async validateTicketQR(qrData, validatorInfo, context = {}) {
//     const { location, ipAddress, userAgent, deviceFingerprint } = context;
//     const { managerId, userId, validatorType } = validatorInfo;

//     try {
//       // Enhanced QR verification with security checks
//       const verification = await this._verifyQRCodeSecurity(qrData, context);
      
//       if (!verification.valid) {
//         await this._logSecurityEvent('QR_VERIFICATION_FAILED', verification.threat, context);
//         return {
//           valid: false,
//           reason: verification.reason,
//           securityAlert: verification.threat?.level || 'LOW'
//         };
//       }

//       const { ticketId, ticketNumber, campaignId, securityHash } = verification.data;

//       // Fraud detection checks
//       const fraudCheck = await this._performFraudDetection(ticketId, context);
//       if (fraudCheck.suspicious) {
//         await this._handleSuspiciousActivity(ticketId, fraudCheck, context);
//         return {
//           valid: false,
//           reason: 'Validation blocked due to suspicious activity',
//           securityAlert: 'HIGH',
//           fraudScore: fraudCheck.score
//         };
//       }

//       // Acquire validation lock
//       const lockKey = `validation:${ticketId}`;
//       const lockToken = await lock.acquire(lockKey, 10);
      
//       if (!lockToken) {
//         throw new ConflictError('Validation in progress. Please wait and try again.');
//       }

//       try {
//         // Enhanced validation processing
//         const result = await this._processTicketValidation(
//           ticketId,
//           ticketNumber,
//           campaignId,
//           validatorInfo,
//           context,
//           fraudCheck
//         );

//         await lock.release(lockKey, lockToken);

//         // Queue post-validation processes
//         await this._queuePostValidationTasks(result, context);

//         return result;

//       } catch (error) {
//         await lock.release(lockKey, lockToken);
//         throw error;
//       }

//     } catch (error) {
//       logger.error('Enhanced validation failed:', {
//         ticketId: verification?.data?.ticketId,
//         validatorId: managerId || userId,
//         error: error.message,
//         context
//       });
//       throw error;
//     }
//   }

//   /**
//    * Bulk validation for event entry processing
//    */
//   async processBulkValidation(validationRequests, validatorInfo, context = {}) {
//     const { batchSize = 50 } = context;
//     const results = [];
//     const errors = [];

//     try {
//       // Process in batches to avoid overwhelming the system
//       for (let i = 0; i < validationRequests.length; i += batchSize) {
//         const batch = validationRequests.slice(i, i + batchSize);
        
//         const batchResults = await Promise.allSettled(
//           batch.map(request => 
//             this.validateTicketQR(request.qrData, validatorInfo, {
//               ...context,
//               batchIndex: Math.floor(i / batchSize),
//               requestIndex: i + batch.indexOf(request)
//             })
//           )
//         );

//         // Collect results and errors
//         batchResults.forEach((result, index) => {
//           const requestIndex = i + index;
//           if (result.status === 'fulfilled') {
//             results.push({
//               index: requestIndex,
//               ...result.value
//             });
//           } else {
//             errors.push({
//               index: requestIndex,
//               error: result.reason.message || 'Validation failed'
//             });
//           }
//         });

//         // Small delay between batches to prevent overwhelming
//         if (i + batchSize < validationRequests.length) {
//           await new Promise(resolve => setTimeout(resolve, 100));
//         }
//       }

//       const summary = {
//         total: validationRequests.length,
//         successful: results.filter(r => r.valid).length,
//         failed: results.filter(r => !r.valid).length + errors.length,
//         suspicious: results.filter(r => r.securityAlert === 'HIGH').length
//       };

//       logger.info('Bulk validation completed', {
//         validatorId: validatorInfo.managerId || validatorInfo.userId,
//         summary,
//         batchCount: Math.ceil(validationRequests.length / batchSize)
//       });

//       return {
//         summary,
//         results,
//         errors,
//         processedAt: new Date()
//       };

//     } catch (error) {
//       logger.error('Bulk validation failed:', {
//         validatorId: validatorInfo.managerId || validatorInfo.userId,
//         totalRequests: validationRequests.length,
//         error: error.message
//       });
//       throw error;
//     }
//   }

//   /**
//    * Enhanced offline validation with conflict resolution
//    */
//   async processOfflineValidations(offlineValidations, managerId) {
//     const results = {
//       processed: [],
//       conflicts: [],
//       errors: []
//     };

//     try {
//       for (const validation of offlineValidations) {
//         try {
//           const result = await this._processOfflineValidation(validation, managerId);
//           results.processed.push(result);
//         } catch (error) {
//           if (error instanceof ConflictError) {
//             results.conflicts.push({
//               validation,
//               conflict: error.message
//             });
//           } else {
//             results.errors.push({
//               validation,
//               error: error.message
//             });
//           }
//         }
//       }

//       // Handle conflicts with automated resolution where possible
//       if (results.conflicts.length > 0) {
//         const resolvedConflicts = await this._resolveValidationConflicts(results.conflicts);
//         results.resolved = resolvedConflicts;
//       }

//       logger.info('Offline validation sync completed', {
//         managerId,
//         processed: results.processed.length,
//         conflicts: results.conflicts.length,
//         errors: results.errors.length
//       });

//       return results;

//     } catch (error) {
//       logger.error('Offline validation sync failed:', {
//         managerId,
//         totalValidations: offlineValidations.length,
//         error: error.message
//       });
//       throw error;
//     }
//   }

//   /**
//    * Get validation queue status and metrics
//    */
//   async getValidationQueueStatus(filters = {}) {
//     const { campaignId, managerId, timeRange = '1h' } = filters;

//     try {
//       const timeRangeMs = this._parseTimeRange(timeRange);
//       const since = new Date(Date.now() - timeRangeMs);

//       const [
//         queueMetrics,
//         activeValidations,
//         failureRates,
//         throughputMetrics,
//         securityAlerts
//       ] = await Promise.all([
//         this._getQueueMetrics(since, { campaignId, managerId }),
//         this._getActiveValidations({ campaignId, managerId }),
//         this._getFailureRates(since, { campaignId, managerId }),
//         this._getThroughputMetrics(since, { campaignId, managerId }),
//         this._getSecurityAlerts(since, { campaignId, managerId })
//       ]);

//       return {
//         queue: queueMetrics,
//         active: activeValidations,
//         failures: failureRates,
//         throughput: throughputMetrics,
//         security: securityAlerts,
//         timestamp: new Date()
//       };

//     } catch (error) {
//       logger.error('Queue status retrieval failed:', { filters, error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Geofencing validation check
//    */
//   async validateLocationAccess(ticketId, location, campaignId) {
//     try {
//       // Get campaign geofencing settings
//       const campaign = await prisma.ticketCampaign.findUnique({
//         where: { id: campaignId },
//         select: {
//           metadata: true,
//           venue: true,
//           venueAddress: true
//         }
//       });

//       if (!campaign?.metadata?.geofencing) {
//         return { allowed: true, reason: 'No geofencing configured' };
//       }

//       const geofencingConfig = campaign.metadata.geofencing;
//       const { latitude, longitude } = location;

//       // Check if validation is within allowed radius
//       const distance = this._calculateDistance(
//         latitude,
//         longitude,
//         geofencingConfig.centerLat,
//         geofencingConfig.centerLng
//       );

//       const allowed = distance <= geofencingConfig.radiusMeters;

//       if (!allowed) {
//         await this._logSecurityEvent('GEOFENCING_VIOLATION', {
//           ticketId,
//           campaignId,
//           distance,
//           allowedRadius: geofencingConfig.radiusMeters,
//           location
//         });
//       }

//       return {
//         allowed,
//         distance,
//         maxDistance: geofencingConfig.radiusMeters,
//         reason: allowed ? 'Within allowed area' : 'Outside validation area'
//       };

//     } catch (error) {
//       logger.error('Geofencing validation failed:', {
//         ticketId,
//         campaignId,
//         location,
//         error: error.message
//       });
//       return { allowed: true, reason: 'Geofencing check failed - allowing access' };
//     }
//   }

//   // Private helper methods
//   async _verifyQRCodeSecurity(qrData, context) {
//     try {
//       // Basic QR verification
//       const basicVerification = verifyQRData(qrData);
//       if (!basicVerification.valid) {
//         return basicVerification;
//       }

//       // Enhanced security checks
//       const securityChecks = await this._performSecurityChecks(basicVerification.data, context);
      
//       return {
//         valid: securityChecks.passed,
//         data: basicVerification.data,
//         reason: securityChecks.reason,
//         threat: securityChecks.threat
//       };

//     } catch (error) {
//       return {
//         valid: false,
//         reason: 'QR verification failed',
//         threat: { level: 'HIGH', type: 'VERIFICATION_ERROR' }
//       };
//     }
//   }

//   async _performSecurityChecks(qrData, context) {
//     const checks = {
//       timestamp: this._checkTimestamp(qrData),
//       tampering: await this._checkTampering(qrData),
//       rateLimit: await this._checkRateLimit(context),
//       deviceFingerprint: await this._checkDeviceFingerprint(context)
//     };

//     const failedChecks = Object.entries(checks).filter(([_, result]) => !result.passed);
    
//     if (failedChecks.length > 0) {
//       const threatLevel = failedChecks.some(([_, result]) => result.severity === 'HIGH') ? 'HIGH' : 'MEDIUM';
      
//       return {
//         passed: false,
//         reason: failedChecks.map(([check, result]) => `${check}: ${result.reason}`).join('; '),
//         threat: {
//           level: threatLevel,
//           type: 'SECURITY_CHECK_FAILED',
//           details: failedChecks
//         }
//       };
//     }

//     return { passed: true };
//   }

//   async _performFraudDetection(ticketId, context) {
//     const checks = await Promise.all([
//       this._checkRepeatedAttempts(ticketId, context),
//       this._checkVelocityFraud(context),
//       this._checkLocationFraud(ticketId, context),
//       this._checkDeviceFraud(context),
//       this._checkTimingFraud(ticketId, context)
//     ]);

//     const score = checks.reduce((total, check) => total + check.score, 0);
//     const maxScore = checks.length * 100;
//     const normalizedScore = (score / maxScore) * 100;

//     const suspicious = normalizedScore > 70; // Threshold for suspicious activity
    
//     return {
//       suspicious,
//       score: normalizedScore,
//       checks,
//       recommendation: this._getFraudRecommendation(normalizedScore)
//     };
//   }

//   async _processTicketValidation(ticketId, ticketNumber, campaignId, validatorInfo, context, fraudCheck) {
//     return await prisma.$transaction(async (tx) => {
//       // Get ticket with all necessary data
//       const ticket = await tx.ticket.findUnique({
//         where: { id: ticketId },
//         include: {
//           campaign: {
//             select: {
//               id: true,
//               title: true,
//               eventDate: true,
//               venue: true,
//               venueAddress: true,
//               isMultiScan: true,
//               maxScansPerTicket: true,
//               sellerId: true,
//               metadata: true
//             }
//           },
//           booking: {
//             select: {
//               id: true,
//               bookingRef: true,
//               customer: {
//                 select: {
//                   firstName: true,
//                   lastName: true,
//                   email: true
//                 }
//               }
//             }
//           }
//         }
//       });

//       if (!ticket) {
//         throw new NotFoundError('Ticket not found');
//       }

//       // Verify authorization
//       await this._verifyValidatorAuthorization(validatorInfo, ticket.campaign.sellerId, tx);

//       // Perform validation checks
//       const validationResult = await this._performValidationChecks(ticket, context);
//       if (!validationResult.valid) {
//         return validationResult;
//       }

//       // Update ticket status
//       const updatedTicket = await this._updateTicketStatus(ticket, tx);

//       // Create validation log
//       const validation = await tx.ticketValidation.create({
//         data: {
//           ticketId,
//           campaignId,
//           validatedBy: validatorInfo.managerId || null,
//           validatedByUser: validatorInfo.userId || null,
//           validationMethod: context.method || 'QR_SCAN',
//           scanNumber: updatedTicket.scanCount,
//           location: context.location,
//           ipAddress: context.ipAddress,
//           userAgent: context.userAgent,
//           isValid: true,
//           metadata: {
//             validatorType: validatorInfo.validatorType,
//             fraudScore: fraudCheck.score,
//             securityChecks: context.securityChecks,
//             deviceFingerprint: context.deviceFingerprint,
//             geolocation: context.geolocation,
//             timestamp: new Date().toISOString()
//           }
//         }
//       });

//       // Update campaign analytics
//       await this._updateValidationAnalytics(campaignId, validation, tx);

//       return {
//         valid: true,
//         ticket: updatedTicket,
//         campaign: ticket.campaign,
//         customer: ticket.booking.customer,
//         validation,
//         message: this._getSuccessMessage(updatedTicket)
//       };
//     });
//   }

//   async _handleSuspiciousActivity(ticketId, fraudCheck, context) {
//     // Create security alert
//     await prisma.securityAlert.create({
//       data: {
//         type: 'SUSPICIOUS_VALIDATION',
//         severity: fraudCheck.score > 90 ? 'CRITICAL' : 'HIGH',
//         ticketId,
//         metadata: {
//           fraudScore: fraudCheck.score,
//           checks: fraudCheck.checks,
//           context,
//           timestamp: new Date().toISOString()
//         }
//       }
//     });

//     // Notify security team for high-risk events
//     if (fraudCheck.score > 90) {
//       await emailQueue.sendSecurityAlert({
//         type: 'CRITICAL_FRAUD_ATTEMPT',
//         ticketId,
//         fraudScore: fraudCheck.score,
//         context
//       });
//     }

//     logger.security('Suspicious validation activity detected', null, context.ipAddress, context.userAgent, {
//       ticketId,
//       fraudScore: fraudCheck.score,
//       checks: fraudCheck.checks
//     });
//   }

//   async _processOfflineValidation(validation, managerId) {
//     // Check if validation already exists
//     const existing = await prisma.ticketValidation.findFirst({
//       where: {
//         ticketId: validation.ticketId,
//         createdAt: {
//           gte: new Date(validation.timestamp - 60000), // 1 minute tolerance
//           lte: new Date(validation.timestamp + 60000)
//         }
//       }
//     });

//     if (existing) {
//       throw new ConflictError(`Validation already exists for ticket ${validation.ticketId} at ${validation.timestamp}`);
//     }

//     // Create validation record
//     return await prisma.ticketValidation.create({
//       data: {
//         ticketId: validation.ticketId,
//         campaignId: validation.campaignId,
//         validatedBy: managerId,
//         validationMethod: 'OFFLINE',
//         scanNumber: validation.scanNumber,
//         location: validation.location,
//         isValid: validation.isValid,
//         createdAt: new Date(validation.timestamp),
//         metadata: {
//           ...validation.metadata,
//           syncedAt: new Date().toISOString(),
//           offlineValidation: true
//         }
//       }
//     });
//   }

//   _parseTimeRange(timeRange) {
//     const ranges = {
//       '1h': 60 * 60 * 1000,
//       '6h': 6 * 60 * 60 * 1000,
//       '24h': 24 * 60 * 60 * 1000,
//       '7d': 7 * 24 * 60 * 60 * 1000
//     };
//     return ranges[timeRange] || ranges['1h'];
//   }

//   _calculateDistance(lat1, lon1, lat2, lon2) {
//     const R = 6371e3; // Earth's radius in meters
//     const φ1 = lat1 * Math.PI / 180;
//     const φ2 = lat2 * Math.PI / 180;
//     const Δφ = (lat2 - lat1) * Math.PI / 180;
//     const Δλ = (lon2 - lon1) * Math.PI / 180;

//     const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
//               Math.cos(φ1) * Math.cos(φ2) *
//               Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

//     return R * c; // Distance in meters
//   }

//   async _logSecurityEvent(eventType, details, context = {}) {
//     await prisma.securityLog.create({
//       data: {
//         eventType,
//         details,
//         context,
//         ipAddress: context.ipAddress,
//         userAgent: context.userAgent,
//         timestamp: new Date()
//       }
//     });
//   }

//   _getSuccessMessage(ticket) {
//     const { scanCount, maxScans } = ticket;
//     if (maxScans === 1) {
//       return 'Ticket validated successfully';
//     }
//     return `Ticket validated successfully (Scan ${scanCount}/${maxScans})`;
//   }

//   _getFraudRecommendation(score) {
//     if (score < 30) return 'ALLOW';
//     if (score < 70) return 'REVIEW';
//     return 'BLOCK';
//   }

//   // Additional helper methods would continue here...
//   // For brevity, I'm showing the structure and key methods
// }

// export default new ValidationService();

import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import { verifyQRData } from '../../../shared/utils/encryption.js';
import { 
  ValidationError, 
  NotFoundError,
  AuthorizationError,
  ConflictError
} from '../../../shared/errors/AppError.js';

class ValidationService {
  /**
   * Core Ticket Validation Logic
   * Handles: Decryption, Status Check, Campaign Check, Scan Counting, Atomic Update
   */
  async validateTicketQR(qrData, validatorInfo, context = {}) {
    const { managerId, userId } = validatorInfo;

    // 1. Verify and Decrypt QR Data
    const verification = verifyQRData(qrData);
    if (!verification.valid) {
      throw new ValidationError('Invalid QR Code format or signature');
    }

    const { ticketId, ticketNumber, campaignId, securityHash } = verification.data;

    // 2. Atomic Transaction: Check & Update
    return await prisma.$transaction(async (tx) => {
      // A. Fetch Ticket with Campaign rules
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              sellerId: true,
              status: true,
              eventDate: true,
              isMultiScan: true,
              maxScansPerTicket: true
            }
          },
          booking: {
            select: {
              customer: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          }
        }
      });

      if (!ticket) throw new NotFoundError('Ticket not found');

      // B. Security & Logic Checks
      if (ticket.campaign.status !== 'ACTIVE') {
        throw new ValidationError('Campaign is not active');
      }

      // Check if this manager is allowed to scan for this campaign
      await this._verifyValidatorAuthorization(validatorInfo, ticket.campaign.sellerId, tx);

      // C. Status Check
      if (ticket.status === 'CANCELLED') throw new ConflictError('Ticket is CANCELLED');
      if (ticket.status === 'EXPIRED') throw new ConflictError('Ticket is EXPIRED');
      
      // D. Check Scan Limits (Crucial for Multi-Scan)
      const currentScans = ticket.scanCount;
      const maxScans = ticket.maxScans; // From Ticket model (overrides campaign if set)

      if (ticket.status === 'USED' || currentScans >= maxScans) {
        throw new ConflictError(`Ticket already used (${currentScans}/${maxScans} scans)`);
      }

      // E. Calculate New State
      const newScanCount = currentScans + 1;
      const newStatus = newScanCount >= maxScans ? 'USED' : 'VALID';

      // F. Update Ticket
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          scanCount: newScanCount,
          status: newStatus,
          usedAt: new Date() // Updates timestamp of last usage
        }
      });

      // G. Log the Validation
      const validation = await tx.ticketValidation.create({
        data: {
          ticketId,
          campaignId: ticket.campaignId,
          validatedBy: managerId || null,     // Log Manager ID if present
          validatedByUser: userId || null,    // Log Seller User ID if scanning themselves
          validationMethod: context.method || 'QR_SCAN',
          scanNumber: newScanCount,
          location: context.location,
          isValid: true,
          createdAt: new Date()
        }
      });

      // H. Return Success Response
      return {
        valid: true,
        message: newStatus === 'USED' ? 'Ticket Validated (Final Scan)' : `Ticket Validated (Scan ${newScanCount}/${maxScans})`,
        ticket: {
          id: updatedTicket.id,
          ticketNumber: updatedTicket.ticketNumber,
          status: updatedTicket.status,
          scanCount: updatedTicket.scanCount,
          maxScans: updatedTicket.maxScans,
          remainingScans: maxScans - newScanCount
        },
        campaign: {
          title: ticket.campaign.title,
          eventDate: ticket.campaign.eventDate
        },
        customer: ticket.booking.customer,
        validationId: validation.id
      };
    });
  }

  /**
   * Sync Offline Validations
   * Strategy: "Server Wins" - If ticket is already used on server, we log the attempt but don't re-increment.
   */
  async processOfflineValidations(offlineValidations, managerId) {
    const results = { processed: 0, conflicts: 0, errors: 0 };

    for (const record of offlineValidations) {
      try {
        await prisma.$transaction(async (tx) => {
          // Check if this validation log already exists (idempotency)
          const exists = await tx.ticketValidation.findFirst({
            where: {
              ticketId: record.ticketId,
              createdAt: new Date(record.timestamp) 
            }
          });

          if (exists) return; // Skip duplicates

          const ticket = await tx.ticket.findUnique({ where: { id: record.ticketId } });
          
          if (!ticket) throw new Error('Ticket not found');

          // Check if ticket state on server matches offline expectation
          let conflict = false;
          if (ticket.scanCount >= ticket.maxScans) {
            conflict = true; // Ticket was fully used on server already
          }

          if (!conflict) {
             // Update ticket state if it makes sense
             const newCount = ticket.scanCount + 1;
             await tx.ticket.update({
               where: { id: ticket.id },
               data: {
                 scanCount: newCount,
                 status: newCount >= ticket.maxScans ? 'USED' : 'VALID',
                 usedAt: new Date(record.timestamp)
               }
             });
          }

          // Always log the offline scan, even if conflict (marked as valid=false if conflict)
          await tx.ticketValidation.create({
            data: {
              ticketId: record.ticketId,
              campaignId: record.campaignId,
              validatedBy: managerId,
              validationMethod: 'OFFLINE_SYNC',
              scanNumber: ticket.scanCount + (conflict ? 0 : 1),
              isValid: !conflict,
              createdAt: new Date(record.timestamp), // Use actual scan time
              metadata: {
                syncedAt: new Date(),
                conflictReason: conflict ? 'Already used on server' : null
              }
            }
          });

          if (conflict) results.conflicts++;
          else results.processed++;
        });

      } catch (error) {
        logger.error(`Offline sync error for ticket ${record.ticketId}`, error);
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Helper: Ensure Manager/User is authorized for this Campaign
   */
  async _verifyValidatorAuthorization(validatorInfo, campaignSellerId, tx) {
    const { managerId, userId } = validatorInfo;

    // Case 1: Validator is the Seller (User)
    if (userId && !managerId) {
      if (userId !== campaignSellerId) {
        throw new AuthorizationError('Seller not authorized for this campaign');
      }
      return true;
    }

    // Case 2: Validator is a Manager
    if (managerId) {
      const manager = await tx.manager.findUnique({
        where: { id: managerId }
      });
      
      if (!manager) throw new AuthorizationError('Manager profile not found');
      if (!manager.isActive) throw new AuthorizationError('Manager account is inactive');
      
      if (manager.sellerId !== campaignSellerId) {
        throw new AuthorizationError('Manager not authorized for this campaign');
      }
      return true;
    }
  }
}

export default new ValidationService();