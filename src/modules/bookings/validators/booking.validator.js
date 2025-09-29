import { body, param, query, validationResult } from 'express-validator';
import { ValidationError } from '../../../shared/errors/AppError.js';

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
    }));
    throw new ValidationError('Validation failed', errorMessages);
  }
  next();
};

export const validateBooking = [
  body('campaignId')
    .notEmpty().withMessage('Campaign ID is required')
    .isUUID().withMessage('Invalid campaign ID'),
  
  body('ticketType')
    .trim()
    .notEmpty().withMessage('Ticket type is required')
    .isLength({ min: 1, max: 50 }).withMessage('Ticket type must be between 1 and 50 characters'),
  
  body('quantity')
    .notEmpty().withMessage('Quantity is required')
    .isInt({ min: 1, max: 20 }).withMessage('Quantity must be between 1 and 20'),
  
  body('issuanceType')
    .notEmpty().withMessage('Issuance type is required')
    .isIn(['SINGLE', 'SEPARATE']).withMessage('Issuance type must be SINGLE or SEPARATE'),
  
  handleValidationErrors,
];

export const validateCancelBooking = [
  param('bookingId')
    .isUUID().withMessage('Invalid booking ID'),
  
  body('reason')
    .optional()
    .trim()
    .isLength({ min: 3, max: 500 }).withMessage('Cancellation reason must be between 3 and 500 characters'),
  
  handleValidationErrors,
];

export const validateConfirmBooking = [
  param('bookingId')
    .isUUID().withMessage('Invalid booking ID'),
  
  body('paymentId')
    .notEmpty().withMessage('Payment ID is required')
    .isUUID().withMessage('Invalid payment ID'),
  
  handleValidationErrors,
];

export const validateBookingQuery = [
  query('status')
    .optional()
    .isIn(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED'])
    .withMessage('Invalid booking status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors,
];

/**
 * Validate booking modification request
 */
export const validateBookingModification = [
  param('bookingId')
    .isUUID().withMessage('Invalid booking ID'),
  
  body('newTicketType')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('New ticket type must be between 1 and 50 characters'),
  
  body('newQuantity')
    .optional()
    .isInt({ min: 1, max: 20 }).withMessage('New quantity must be between 1 and 20'),
  
  body('reason')
    .notEmpty().withMessage('Reason for modification is required')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
  
  handleValidationErrors,
];

/**
 * Validate refund request
 */
export const validateRefundRequest = [
  param('bookingId')
    .isUUID().withMessage('Invalid booking ID'),
  
  body('reason')
    .notEmpty().withMessage('Reason for refund is required')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Refund amount must be a positive number'),
  
  handleValidationErrors,
];

/**
 * Validate waitlist entry
 */
export const validateWaitlistEntry = [
  param('campaignId')
    .isUUID().withMessage('Invalid campaign ID'),
  
  body('ticketType')
    .trim()
    .notEmpty().withMessage('Ticket type is required')
    .isLength({ min: 1, max: 50 }).withMessage('Ticket type must be between 1 and 50 characters'),
  
  body('quantity')
    .notEmpty().withMessage('Quantity is required')
    .isInt({ min: 1, max: 20 }).withMessage('Quantity must be between 1 and 20'),
  
  body('notificationPreferences')
    .optional()
    .isObject().withMessage('Notification preferences must be an object'),
  
  body('notificationPreferences.email')
    .optional()
    .isBoolean().withMessage('Email notification preference must be boolean'),
  
  body('notificationPreferences.sms')
    .optional()
    .isBoolean().withMessage('SMS notification preference must be boolean'),
  
  handleValidationErrors,
];

/**
 * Validate enhanced booking creation with promo codes and group booking
 */
export const validateEnhancedBooking = [
  body('campaignId')
    .notEmpty().withMessage('Campaign ID is required')
    .isUUID().withMessage('Invalid campaign ID'),
  
  body('ticketType')
    .trim()
    .notEmpty().withMessage('Ticket type is required')
    .isLength({ min: 1, max: 50 }).withMessage('Ticket type must be between 1 and 50 characters'),
  
  body('quantity')
    .notEmpty().withMessage('Quantity is required')
    .isInt({ min: 1, max: 20 }).withMessage('Quantity must be between 1 and 20'),
  
  body('issuanceType')
    .notEmpty().withMessage('Issuance type is required')
    .isIn(['SINGLE', 'SEPARATE']).withMessage('Issuance type must be SINGLE or SEPARATE'),
  
  body('promoCode')
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 }).withMessage('Promo code must be between 3 and 20 characters')
    .isAlphanumeric().withMessage('Promo code must contain only letters and numbers'),
  
  body('groupBookingInfo')
    .optional()
    .isObject().withMessage('Group booking info must be an object'),
  
  body('groupBookingInfo.groupName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Group name must be between 2 and 100 characters'),
  
  body('groupBookingInfo.contactEmail')
    .optional()
    .isEmail().withMessage('Contact email must be valid'),
  
  body('groupBookingInfo.contactPhone')
    .optional()
    .isMobilePhone().withMessage('Contact phone must be valid'),
  
  handleValidationErrors,
];

/**
 * Validate enhanced cancellation with refund options
 */
export const validateEnhancedCancellation = [
  param('bookingId')
    .isUUID().withMessage('Invalid booking ID'),
  
  body('reason')
    .notEmpty().withMessage('Cancellation reason is required')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
  
  body('requestRefund')
    .optional()
    .isBoolean().withMessage('Request refund must be boolean'),
  
  handleValidationErrors,
];
