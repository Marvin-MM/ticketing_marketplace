import { sessionStore } from '../../config/redis.js';
import logger from '../../config/logger.js';
import { generateSecureToken } from './encryption.js';

/**
 * Session management utilities for Redis-backed sessions
 */

// Session TTL constants (in seconds)
export const SESSION_TTL = {
  ACCESS_TOKEN: 15 * 60, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 60 * 60, // 7 days
  REFRESH_TOKEN_EXTENDED: 30 * 24 * 60 * 60, // 30 days (remember me)
};

/**
 * Create a new session with access and refresh tokens
 */
export const createSession = async (user, rememberMe = false) => {
  try {
    const sessionId = generateSecureToken(32);
    const refreshTokenId = generateSecureToken(32);
    
    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      refreshTokenId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      rememberMe,
    };

    // Store session with access token TTL
    await sessionStore.set(
      `session:${sessionId}`,
      sessionData,
      SESSION_TTL.ACCESS_TOKEN
    );

    // Store refresh token separately with longer TTL
    const refreshTokenData = {
      userId: user.id,
      sessionId,
      createdAt: Date.now(),
    };

    const refreshTTL = rememberMe 
      ? SESSION_TTL.REFRESH_TOKEN_EXTENDED 
      : SESSION_TTL.REFRESH_TOKEN;

    await sessionStore.set(
      `refresh:${refreshTokenId}`,
      refreshTokenData,
      refreshTTL
    );

    logger.debug('Session created', { 
      userId: user.id, 
      sessionId: sessionId.substring(0, 8),
      rememberMe 
    });

    return {
      sessionId,
      refreshTokenId,
      expiresIn: SESSION_TTL.ACCESS_TOKEN,
    };
  } catch (error) {
    logger.error('Failed to create session:', error);
    throw error;
  }
};

/**
 * Get session data by session ID
 */
export const getSession = async (sessionId) => {
  try {
    const data = await sessionStore.get(`session:${sessionId}`);
    
    if (!data) {
      return null;
    }

    // Update last activity
    await sessionStore.touch(`session:${sessionId}`, SESSION_TTL.ACCESS_TOKEN);
    
    return data;
  } catch (error) {
    logger.error('Failed to get session:', error);
    return null;
  }
};

/**
 * Refresh session using refresh token
 */
export const refreshSession = async (refreshTokenId) => {
  try {
    // Get refresh token data
    const refreshData = await sessionStore.get(`refresh:${refreshTokenId}`);
    
    if (!refreshData) {
      logger.warn('Refresh token not found or expired', { 
        tokenId: refreshTokenId.substring(0, 8) 
      });
      return null;
    }

    // Get old session to check if it exists
    const oldSession = await sessionStore.get(`session:${refreshData.sessionId}`);
    
    // Create new session ID but keep the same refresh token
    const newSessionId = generateSecureToken(32);
    
    const sessionData = {
      userId: refreshData.userId,
      email: oldSession?.email,
      role: oldSession?.role,
      refreshTokenId,
      createdAt: refreshData.createdAt,
      lastActivity: Date.now(),
      rememberMe: oldSession?.rememberMe || false,
    };

    // Store new session
    await sessionStore.set(
      `session:${newSessionId}`,
      sessionData,
      SESSION_TTL.ACCESS_TOKEN
    );

    // Delete old session if it exists
    if (refreshData.sessionId) {
      await sessionStore.delete(`session:${refreshData.sessionId}`);
    }

    // Update refresh token with new session ID
    await sessionStore.set(
      `refresh:${refreshTokenId}`,
      { ...refreshData, sessionId: newSessionId },
      oldSession?.rememberMe 
        ? SESSION_TTL.REFRESH_TOKEN_EXTENDED 
        : SESSION_TTL.REFRESH_TOKEN
    );

    logger.debug('Session refreshed', { 
      userId: refreshData.userId,
      oldSessionId: refreshData.sessionId?.substring(0, 8),
      newSessionId: newSessionId.substring(0, 8),
    });

    return {
      sessionId: newSessionId,
      userId: refreshData.userId,
      expiresIn: SESSION_TTL.ACCESS_TOKEN,
    };
  } catch (error) {
    logger.error('Failed to refresh session:', error);
    return null;
  }
};

/**
 * Destroy session and refresh token
 */
export const destroySession = async (sessionId, refreshTokenId) => {
  try {
    const promises = [];
    
    if (sessionId) {
      promises.push(sessionStore.delete(`session:${sessionId}`));
    }
    
    if (refreshTokenId) {
      promises.push(sessionStore.delete(`refresh:${refreshTokenId}`));
    }

    await Promise.all(promises);

    logger.debug('Session destroyed', { 
      sessionId: sessionId?.substring(0, 8),
      refreshTokenId: refreshTokenId?.substring(0, 8),
    });

    return true;
  } catch (error) {
    logger.error('Failed to destroy session:', error);
    return false;
  }
};

/**
 * Destroy all sessions for a user
 */
export const destroyAllUserSessions = async (userId) => {
  try {
    // Note: This requires scanning Redis keys which is not ideal for production
    // Consider maintaining a user->sessions mapping in Redis for better performance
    logger.info('Destroying all sessions for user', { userId });
    
    // This is a placeholder - implement based on your Redis key structure
    // You might want to maintain a set of session IDs per user
    
    return true;
  } catch (error) {
    logger.error('Failed to destroy all user sessions:', error);
    return false;
  }
};

/**
 * Validate session and return user data
 */
export const validateSession = async (sessionId) => {
  try {
    const session = await getSession(sessionId);
    
    if (!session) {
      return { valid: false, reason: 'Session not found or expired' };
    }

    // Check if session is too old (beyond max age)
    const sessionAge = Date.now() - session.createdAt;
    const maxAge = session.rememberMe 
      ? SESSION_TTL.REFRESH_TOKEN_EXTENDED * 1000 
      : SESSION_TTL.REFRESH_TOKEN * 1000;

    if (sessionAge > maxAge) {
      await destroySession(sessionId, session.refreshTokenId);
      return { valid: false, reason: 'Session expired' };
    }

    return {
      valid: true,
      session,
    };
  } catch (error) {
    logger.error('Failed to validate session:', error);
    return { valid: false, reason: 'Validation error' };
  }
};

/**
 * Extend session TTL (touch)
 */
export const extendSession = async (sessionId) => {
  try {
    await sessionStore.touch(`session:${sessionId}`, SESSION_TTL.ACCESS_TOKEN);
    return true;
  } catch (error) {
    logger.error('Failed to extend session:', error);
    return false;
  }
};
