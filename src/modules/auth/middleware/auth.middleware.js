import { AuthenticationError, AuthorizationError } from '../../../shared/errors/AppError.js';
import logger from '../../../config/logger.js';
import prisma from '../../../config/database.js';
import { extractSessionFromCookie } from '../../../shared/utils/token.utils.js';
import { validateSession, extendSession } from '../../../shared/utils/session.js';

/**
 * Ensure user is authenticated using cookie-based sessions
 */
export const ensureAuthenticated = async (req, res, next) => {
  try {
    // Extract session ID from cookie
    const sessionId = extractSessionFromCookie(req);
    
    if (!sessionId) {
      throw new AuthenticationError('Please log in to access this resource');
    }

    // Validate session in Redis
    const sessionResult = await validateSession(sessionId);
    
    if (!sessionResult.valid) {
      throw new AuthenticationError(sessionResult.reason || 'Invalid or expired session');
    }

    const { session } = sessionResult;

    // Get fresh user data from database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
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

    // Attach user and session to request
    req.user = user;
    req.sessionId = sessionId;
    req.sessionData = session;

    // Extend session TTL on activity
    await extendSession(sessionId);

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.error('Authentication error:', error);
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
export const ensureApprovedSeller = async (req, res, next) => {
  try {
    // First ensure authentication
    await ensureAuthenticated(req, res, () => {});

    if (!req.user) {
      throw new AuthenticationError('Please log in to access this resource');
    }

    if (req.user.role !== 'SELLER' || req.user.applicationStatus !== 'APPROVED') {
      throw new AuthorizationError('Only approved sellers can access this resource');
    }

    next();
  } catch (error) {
    next(error);
  }
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