import { AuthenticationError, AuthorizationError } from '../../../shared/errors/AppError.js';
import logger from '../../../config/logger.js';
import prisma from '../../../config/database.js';
import { verifyToken, extractTokenFromHeader } from '../../../shared/utils/jwt.js';

/**
 * Ensure user is authenticated (supports both JWT and session)
 */
export const ensureAuthenticated = async (req, res, next) => {
  try {
    // Check session authentication first
    if (req.isAuthenticated() && req.user) {
      return next();
    }

    // Check JWT authentication
    const token = extractTokenFromHeader(req);
    if (!token) {
      throw new AuthenticationError('Please log in to access this resource');
    }

    // Verify JWT token
    const tokenResult = verifyToken(token);
    if (!tokenResult.valid) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: tokenResult.payload.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        applicationStatus: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or account deactivated');
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Authentication failed');
  }
};

/**
 * Ensure user has specific roles
 */
export const ensureRoles = (...roles) => {
  return async (req, res, next) => {
    try {
      // First ensure authentication
      await ensureAuthenticated(req, res, () => {});

      if (!req.user) {
        throw new AuthenticationError('Please log in to access this resource');
      }

      if (!roles.includes(req.user.role)) {
        logger.warn('Unauthorized access attempt', {
          userId: req.user.id,
          userRole: req.user.role,
          attemptedRoles: roles,
          endpoint: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
        
        throw new AuthorizationError('You do not have permission to access this resource');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Ensure user is seller with approved application
 */
export const ensureApprovedSeller = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    throw new AuthenticationError('Please log in to access this resource');
  }

  if (req.user.role !== 'SELLER' || req.user.applicationStatus !== 'APPROVED') {
    throw new AuthorizationError('Only approved sellers can access this resource');
  }

  next();
};

/**
 * Optional authentication - doesn't throw error if not authenticated
 */
export const optionalAuth = (req, res, next) => {
  next();
};

/**
 * Extract user from JWT token (for API access)
 */
export const extractUserFromToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next();
    }

    // Token validation would go here if using JWT
    // For now, we're using session-based auth
    next();
  } catch (error) {
    next();
  }
};