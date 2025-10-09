import config from '../../config/index.js';
import { SESSION_TTL } from './session.js';

/**
 * Cookie configuration and utilities
 */

/**
 * Get base cookie options with security settings
 */
const getBaseCookieOptions = () => ({
  httpOnly: true,
  secure: config.app.isProduction, // HTTPS only in production
  sameSite: config.app.isProduction ? 'strict' : 'lax',
  path: '/',
  domain: config.app.isProduction ? undefined : undefined, // Set domain in production if needed
});

/**
 * Set session cookie (access token)
 */
export const setSessionCookie = (res, sessionId, rememberMe = false) => {
  const maxAge = SESSION_TTL.ACCESS_TOKEN * 1000; // Convert to milliseconds

  res.cookie('sessionId', sessionId, {
    ...getBaseCookieOptions(),
    maxAge,
  });
};

/**
 * Set refresh token cookie
 */
export const setRefreshTokenCookie = (res, refreshToken, rememberMe = false) => {
  const maxAge = rememberMe 
    ? SESSION_TTL.REFRESH_TOKEN_EXTENDED * 1000 
    : SESSION_TTL.REFRESH_TOKEN * 1000;

  res.cookie('refreshToken', refreshToken, {
    ...getBaseCookieOptions(),
    maxAge,
  });
};

/**
 * Set both session and refresh token cookies
 */
export const setAuthCookies = (res, sessionId, refreshToken, rememberMe = false) => {
  setSessionCookie(res, sessionId, rememberMe);
  setRefreshTokenCookie(res, refreshToken, rememberMe);
};

/**
 * Clear session cookie
 */
export const clearSessionCookie = (res) => {
  res.clearCookie('sessionId', {
    ...getBaseCookieOptions(),
  });
};

/**
 * Clear refresh token cookie
 */
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    ...getBaseCookieOptions(),
  });
};

/**
 * Clear all auth cookies
 */
export const clearAuthCookies = (res) => {
  clearSessionCookie(res);
  clearRefreshTokenCookie(res);
  
  // Also clear legacy session cookie if it exists
  res.clearCookie('connect.sid', {
    path: '/',
    httpOnly: true,
  });
};

/**
 * Set CSRF token cookie (if implementing CSRF protection)
 */
export const setCsrfCookie = (res, csrfToken) => {
  res.cookie('XSRF-TOKEN', csrfToken, {
    httpOnly: false, // Needs to be readable by client for CSRF
    secure: config.app.isProduction,
    sameSite: config.app.isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_TTL.ACCESS_TOKEN * 1000,
  });
};
