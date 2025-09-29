import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import logger from '../../config/logger.js';

/**
 * Generate JWT access token
 */
export const generateAccessToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    type: 'access'
  };

  return jwt.sign(payload, config.auth.jwt.secret, {
    expiresIn: config.auth.jwt.expiry,
    issuer: 'ticketing-marketplace',
    audience: 'ticketing-users'
  });
};

/**
 * Generate JWT refresh token
 */
export const generateRefreshToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    type: 'refresh'
  };

  return jwt.sign(payload, config.auth.jwt.refreshSecret, {
    expiresIn: config.auth.jwt.refreshExpiry,
    issuer: 'ticketing-marketplace',
    audience: 'ticketing-users'
  });
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokens = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    expiresIn: config.auth.jwt.expiry
  };
};

/**
 * Verify JWT token
 */
export const verifyToken = (token, isRefreshToken = false) => {
  try {
    const secret = isRefreshToken ? config.auth.jwt.refreshSecret : config.auth.jwt.secret;
    const decoded = jwt.verify(token, secret, {
      issuer: 'ticketing-marketplace',
      audience: 'ticketing-users'
    });

    // Verify token type
    if (isRefreshToken && decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    if (!isRefreshToken && decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return { valid: true, payload: decoded };
  } catch (error) {
    logger.warn('JWT verification failed', { error: error.message });
    return { valid: false, error: error.message };
  }
};

/**
 * Extract token from request headers
 */
export const extractTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

/**
 * Generate email verification token
 */
export const generateVerificationToken = (userId, email) => {
  const payload = {
    id: userId,
    email,
    type: 'email_verification'
  };

  return jwt.sign(payload, config.auth.jwt.secret, {
    expiresIn: '24h',
    issuer: 'ticketing-marketplace',
    audience: 'email-verification'
  });
};

/**
 * Generate password reset token
 */
export const generatePasswordResetToken = (userId, email) => {
  const payload = {
    id: userId,
    email,
    type: 'password_reset'
  };

  return jwt.sign(payload, config.auth.jwt.secret, {
    expiresIn: '1h',
    issuer: 'ticketing-marketplace',
    audience: 'password-reset'
  });
};

/**
 * Verify special purpose tokens (email verification, password reset)
 */
export const verifySpecialToken = (token, expectedType, expectedAudience) => {
  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret, {
      issuer: 'ticketing-marketplace',
      audience: expectedAudience
    });

    if (decoded.type !== expectedType) {
      throw new Error('Invalid token type');
    }

    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    return null;
  }
};