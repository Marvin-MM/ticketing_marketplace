import express from 'express';
import passport from '../config/passport.js';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { validateRequest } from '../../../shared/middleware/validation.js';
import { ensureAuthenticated, ensureRoles } from '../middleware/auth.middleware.js';
import {
  register,
  login,
  refreshToken,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  googleCallback,
  logout,
  applySeller,
  applicationStatus,
  approveSeller,
  createManager,
  deactivateManager,
  profile,
} from '../controllers/auth.controller.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sellerApplicationSchema,
  createManagerSchema,
  reviewApplicationSchema,
} from '../validation/auth.validation.js';

const router = express.Router();

// Traditional authentication routes
router.post('/register', validateRequest(registerSchema), asyncHandler(register));
router.post('/login', validateRequest(loginSchema), asyncHandler(login));
router.post('/refresh-token', validateRequest(refreshTokenSchema), asyncHandler(refreshToken));

// Email verification routes
router.post('/verify-email', validateRequest(verifyEmailSchema), asyncHandler(verifyEmail));
router.post('/resend-verification', validateRequest(forgotPasswordSchema), asyncHandler(resendVerification));

// Password reset routes
router.post('/forgot-password', validateRequest(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post('/reset-password', validateRequest(resetPasswordSchema), asyncHandler(resetPassword));
router.post('/change-password', ensureAuthenticated, validateRequest(changePasswordSchema), asyncHandler(changePassword));

// Google OAuth routes
router.get('/google', passport.authenticate('google'));
router.get('/google/callback', googleCallback);

// Logout
router.post('/logout', ensureAuthenticated, asyncHandler(logout));

// Seller application routes
router.post('/apply-seller', ensureAuthenticated, validateRequest(sellerApplicationSchema), asyncHandler(applySeller));
router.get('/application-status', ensureAuthenticated, asyncHandler(applicationStatus));
router.post('/approve-seller/:applicationId', ensureRoles('SUPER_ADMIN'), validateRequest(reviewApplicationSchema), asyncHandler(approveSeller));

// Manager management routes
router.post('/create-manager', ensureRoles('SELLER'), validateRequest(createManagerSchema), asyncHandler(createManager));
router.post('/deactivate-manager/:managerId', ensureRoles('SELLER'), asyncHandler(deactivateManager));

// Profile route
router.get('/profile', ensureAuthenticated, asyncHandler(profile));

export default router;