import express from 'express';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { ensureAuthenticated, ensureRoles } from '../../auth/middleware/auth.middleware.js';
import {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  // confirmBooking,
  getCampaignBookingStats,
  modifyBooking,
  requestRefund,
  addToWaitlist,
  getEnhancedCampaignBookingAnalytics,
  getSellerBookingAnalytics,
  getPlatformBookingAnalytics,
  getRealTimeBookingMetrics,
  enhancedCancelBooking,
} from '../controllers/booking.controller.js';
import {
  validateBooking,
  validateBookingModification,
  validateRefundRequest,
  validateWaitlistEntry,
  validateEnhancedBooking,
  validateEnhancedCancellation
} from '../validators/booking.validator.js';

const router = express.Router();

// Customer routes
router.post('/', ensureAuthenticated, validateBooking, asyncHandler(createBooking));
router.post('/enhanced', ensureAuthenticated, validateEnhancedBooking, asyncHandler(createBooking));
router.get('/my-bookings', ensureAuthenticated, asyncHandler(getUserBookings));
router.get('/:bookingId', ensureAuthenticated, asyncHandler(getBookingById));
router.post('/:bookingId/cancel', ensureAuthenticated, asyncHandler(cancelBooking));

// System routes (called after payment verification)
// router.post('/:bookingId/confirm', asyncHandler(confirmBooking));

// Enhanced booking management routes
router.put('/:bookingId/modify', ensureAuthenticated, validateBookingModification, asyncHandler(modifyBooking));
router.post('/:bookingId/refund', ensureAuthenticated, validateRefundRequest, asyncHandler(requestRefund));
router.post('/:bookingId/cancel-enhanced', ensureAuthenticated, validateEnhancedCancellation, asyncHandler(enhancedCancelBooking));
router.post('/waitlist/:campaignId', ensureAuthenticated, validateWaitlistEntry, asyncHandler(addToWaitlist));

// Analytics routes
router.get('/analytics/real-time', ensureRoles('SUPER_ADMIN', 'SELLER'), asyncHandler(getRealTimeBookingMetrics));
router.get('/analytics/seller', ensureRoles('SELLER'), asyncHandler(getSellerBookingAnalytics));
router.get('/analytics/platform', ensureRoles('SUPER_ADMIN'), asyncHandler(getPlatformBookingAnalytics));
router.get('/campaign/:campaignId/analytics-enhanced', ensureRoles('SELLER'), asyncHandler(getEnhancedCampaignBookingAnalytics));

// Seller routes
router.get('/campaign/:campaignId/stats', ensureRoles('SELLER'), asyncHandler(getCampaignBookingStats));

export default router;
