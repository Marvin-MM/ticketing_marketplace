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

export const validateCampaign = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters'),
  
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
  
  body('eventType')
    .trim()
    .notEmpty().withMessage('Event type is required')
    .isIn(['bar', 'sports', 'hotel', 'event', 'concert', 'theater', 'other'])
    .withMessage('Invalid event type'),
  
  body('ticketTypes')
    .notEmpty().withMessage('Ticket types are required')
    .isObject().withMessage('Ticket types must be an object')
    .custom((value) => {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        throw new Error('At least one ticket type is required');
      }
      for (const [key, type] of Object.entries(value)) {
        if (!type.price || type.price < 0) {
          throw new Error(`Invalid price for ticket type ${key}`);
        }
        if (!type.quantity || type.quantity < 1) {
          throw new Error(`Invalid quantity for ticket type ${key}`);
        }
        if (!type.description) {
          throw new Error(`Description required for ticket type ${key}`);
        }
      }
      return true;
    }),
  
  body('maxPerCustomer')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Max per customer must be between 1 and 100'),
  
  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Invalid start date format')
    .custom((value, { req }) => {
      const startDate = new Date(value);
      const now = new Date();
      if (startDate < now) {
        throw new Error('Start date must be in the future');
      }
      return true;
    }),
  
  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Invalid end date format')
    .custom((value, { req }) => {
      const endDate = new Date(value);
      const startDate = new Date(req.body.startDate);
      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  
  body('eventDate')
    .notEmpty().withMessage('Event date is required')
    .isISO8601().withMessage('Invalid event date format')
    .custom((value, { req }) => {
      const eventDate = new Date(value);
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
      if (eventDate < startDate || eventDate > endDate) {
        throw new Error('Event date must be between start and end dates');
      }
      return true;
    }),
  
  body('venue')
    .trim()
    .notEmpty().withMessage('Venue is required')
    .isLength({ min: 2, max: 200 }).withMessage('Venue must be between 2 and 200 characters'),
  
  body('venueAddress')
    .trim()
    .notEmpty().withMessage('Venue address is required')
    .isLength({ min: 5, max: 500 }).withMessage('Venue address must be between 5 and 500 characters'),
  
  body('venueCity')
    .trim()
    .notEmpty().withMessage('Venue city is required')
    .isLength({ min: 2, max: 100 }).withMessage('Venue city must be between 2 and 100 characters'),
  
  body('venueCountry')
    .trim()
    .notEmpty().withMessage('Venue country is required')
    .isLength({ min: 2, max: 100 }).withMessage('Venue country must be between 2 and 100 characters'),
  
  body('coverImage')
    .optional()
    .isURL().withMessage('Cover image must be a valid URL'),
  
  body('images')
    .optional()
    .isArray().withMessage('Images must be an array')
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      for (const url of value) {
        if (!/^https?:\/\/.+/.test(url)) {
          throw new Error('All image URLs must be valid');
        }
      }
      return true;
    }),
  
  body('isMultiScan')
    .optional()
    .isBoolean().withMessage('isMultiScan must be a boolean'),
  
  body('maxScansPerTicket')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Max scans per ticket must be between 1 and 100'),
  
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      if (value.length > 10) {
        throw new Error('Maximum 10 tags allowed');
      }
      return true;
    }),
  
  handleValidationErrors,
];

export const validateCampaignUpdate = [
  param('campaignId')
    .isUUID().withMessage('Invalid campaign ID'),
  
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
  
  body('ticketTypes')
    .optional()
    .isObject().withMessage('Ticket types must be an object')
    .custom((value) => {
      if (!value) return true;
      const keys = Object.keys(value);
      if (keys.length === 0) {
        throw new Error('At least one ticket type is required');
      }
      for (const [key, type] of Object.entries(value)) {
        if (type.price !== undefined && type.price < 0) {
          throw new Error(`Invalid price for ticket type ${key}`);
        }
        if (type.quantity !== undefined && type.quantity < 0) {
          throw new Error(`Invalid quantity for ticket type ${key}`);
        }
      }
      return true;
    }),
  
  body('maxPerCustomer')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Max per customer must be between 1 and 100'),
  
  body('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format'),
  
  body('coverImage')
    .optional()
    .isURL().withMessage('Cover image must be a valid URL'),
  
  body('images')
    .optional()
    .isArray().withMessage('Images must be an array'),
  
  handleValidationErrors,
];

export const validateCampaignQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('eventType')
    .optional()
    .isIn(['bar', 'sports', 'hotel', 'event', 'concert', 'theater', 'other'])
    .withMessage('Invalid event type'),
  
  query('status')
    .optional()
    .isIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED'])
    .withMessage('Invalid status'),
  
  query('sortBy')
    .optional()
    .isIn(['eventDate', 'createdAt', 'title', 'totalQuantity'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors,
];