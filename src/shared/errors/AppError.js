// Custom error classes for application-specific errors

export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', statusCode = 402) {
    super(message, statusCode);
    this.name = 'PaymentError';
  }
}

export class BookingError extends AppError {
  constructor(message = 'Booking failed', statusCode = 400) {
    super(message, statusCode);
    this.name = 'BookingError';
  }
}

export class InventoryError extends AppError {
  constructor(message = 'Inventory not available', statusCode = 409) {
    super(message, statusCode);
    this.name = 'InventoryError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error', statusCode = 503) {
    super(`${service}: ${message}`, statusCode);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}