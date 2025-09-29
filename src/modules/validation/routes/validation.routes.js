import express from 'express';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { ensureAuthenticated, ensureRoles } from '../../auth/middleware/auth.middleware.js';
import {
  validateQRCode,
  managerLogin,
  getValidationHistory,
  getValidationStats,
  manualValidation,
  getOfflineData,
  bulkValidation,
  syncOfflineValidations,
  getValidationDashboard,
  getCampaignAnalytics,
  getFraudDetectionReport,
  getValidatorPerformanceReport,
  getQueueStatus,
  getQueueInsights,
  validateLocationAccess,
  exportAnalyticsReport
} from '../controllers/validation.controller.js';

const router = express.Router();

// Manager authentication
router.post('/manager/login', asyncHandler(managerLogin));

// Enhanced Validation endpoints
router.post('/scan', asyncHandler(validateQRCode));
router.post('/manual', ensureAuthenticated, asyncHandler(manualValidation));
router.post('/bulk', ensureAuthenticated, asyncHandler(bulkValidation));
router.post('/location', ensureAuthenticated, asyncHandler(validateLocationAccess));

// Validation history and stats (Seller only)
router.get('/campaign/:campaignId/history', ensureAuthenticated, asyncHandler(getValidationHistory));
router.get('/campaign/:campaignId/stats', ensureAuthenticated, asyncHandler(getValidationStats));
router.get('/campaign/:campaignId/analytics', ensureAuthenticated, asyncHandler(getCampaignAnalytics));

// Enhanced Analytics Dashboard
router.get('/dashboard', ensureAuthenticated, asyncHandler(getValidationDashboard));
router.get('/fraud-report', ensureAuthenticated, asyncHandler(getFraudDetectionReport));
router.get('/performance-report', ensureAuthenticated, asyncHandler(getValidatorPerformanceReport));

// Queue Management
router.get('/queue/status', ensureAuthenticated, asyncHandler(getQueueStatus));
router.get('/queue/insights', ensureAuthenticated, asyncHandler(getQueueInsights));

// Report Export
router.get('/export', ensureAuthenticated, asyncHandler(exportAnalyticsReport));

// Offline Operations
router.get('/offline/data', asyncHandler(getOfflineData));
router.post('/offline/sync', asyncHandler(syncOfflineValidations));

// Manager-specific endpoints
router.get('/manager/dashboard', asyncHandler(getValidationDashboard));
router.get('/manager/performance', asyncHandler(getValidatorPerformanceReport));
router.get('/manager/queue/status', asyncHandler(getQueueStatus));
router.get('/manager/queue/insights', asyncHandler(getQueueInsights));
router.post('/manager/bulk', asyncHandler(bulkValidation));

export default router;
