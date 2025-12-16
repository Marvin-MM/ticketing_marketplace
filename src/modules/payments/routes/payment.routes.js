import express from 'express';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { ensureAuthenticated } from '../../auth/middleware/auth.middleware.js';
import {
  initializePayment,
  handleWebhook,
  verifyPayment,
  getPaymentHistory,
  requestRefund,
} from '../controllers/payment.controller.js';

const router = express.Router();

// Payment routes
router.post('/initialize', ensureAuthenticated, asyncHandler(initializePayment));
router.get('/webhook', asyncHandler(handleWebhook)); // No auth for webhook
router.get('/verify/:reference', asyncHandler(verifyPayment));
router.get('/history', ensureAuthenticated, asyncHandler(getPaymentHistory));
router.post('/:paymentId/refund', ensureAuthenticated, asyncHandler(requestRefund));

export default router;
