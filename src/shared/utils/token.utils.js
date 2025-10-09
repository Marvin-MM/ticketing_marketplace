// src/shared/utils/jwt.js (Consider renaming this file to token.utils.js)

import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import logger from '../../config/logger.js';

/**
 * Extract session token from cookies
 */
export const extractSessionFromCookie = (req) => {
  return req.cookies?.sessionId || null;
};

/**
 * Extract refresh token from cookies
 */
export const extractRefreshTokenFromCookie = (req) => {
  return req.cookies?.refreshToken || null;
};

/**
 * Generate email verification token
 */
export const generateVerificationToken = (userId, email) => {
  const payload = { id: userId, email, type: 'email_verification' };
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
  const payload = { id: userId, email, type: 'password_reset' };
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