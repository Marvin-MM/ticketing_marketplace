import express from 'express';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { ensureRoles } from '../../auth/middleware/auth.middleware.js';
import {
  getFinancialDashboard,
  addWithdrawalMethod,
  removeWithdrawalMethod,
  requestWithdrawal,
  getWithdrawalHistory,
  getTransactionHistory,
  getRevenueAnalytics,
  verifyWithdrawalMethod,
} from '../controllers/finance.controller.js';

const router = express.Router();

// Financial dashboard (Seller only)
router.get('/dashboard', ensureRoles('SELLER'), asyncHandler(getFinancialDashboard));

// Withdrawal methods
router.post('/withdrawal-methods', ensureRoles('SELLER'), asyncHandler(addWithdrawalMethod));
router.delete('/withdrawal-methods/:methodId', ensureRoles('SELLER'), asyncHandler(removeWithdrawalMethod));

// Withdrawals
router.post('/withdrawals', ensureRoles('SELLER'), asyncHandler(requestWithdrawal));
router.get('/withdrawals', ensureRoles('SELLER'), asyncHandler(getWithdrawalHistory));

// Transactions and analytics
router.get('/transactions', ensureRoles('SELLER'), asyncHandler(getTransactionHistory));
router.get('/analytics', ensureRoles('SELLER'), asyncHandler(getRevenueAnalytics));

// Admin routes
router.post('/withdrawal-methods/:methodId/verify', ensureRoles('SUPER_ADMIN'), asyncHandler(verifyWithdrawalMethod));

export default router;
