import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../../../config/database.js';
import config from '../../../config/index.js';
import logger from '../../../config/logger.js';
import { emailQueue } from '../../../config/rabbitmq.js';
import { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  AuthorizationError,
  AuthenticationError 
} from '../../../shared/errors/AppError.js';
import { hashPassword, generateSecureToken } from '../../../shared/utils/encryption.js';
import { 
  generateVerificationToken, 
  generatePasswordResetToken, 
  verifySpecialToken,
  extractRefreshTokenFromCookie 
} from '../../../shared/utils/token.utils.js';
import { getSession, createSession, refreshSession, destroySession } from '../../../shared/utils/session.js';
import { setAuthCookies, clearAuthCookies } from '../../../shared/utils/cookies.js';

/**
 * Register new user with email/password
 */
export const register = async (req, res) => {
  const { 
    email, 
    password, 
    firstName, 
    lastName, 
    role = 'CUSTOMER',
    phone,
    dateOfBirth 
  } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = generateSecureToken(32);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      emailVerificationToken: verificationToken,
      isEmailVerified: false,
      isActive: true,
    },
  });

  // Create session in Redis
  const { sessionId, refreshTokenId } = await createSession(user, false);

  // Set secure HTTP-only cookies
  setAuthCookies(res, sessionId, refreshTokenId, false);

  // Send verification email
  await emailQueue.sendWelcome({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    verificationToken,
    type: 'EMAIL_VERIFICATION',
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_REGISTRATION',
      entity: 'User',
      entityId: user.id,
      metadata: {
        method: 'email_password',
        role: user.role,
      },
    },
  });

  logger.info('User registered successfully', { 
    userId: user.id, 
    email: user.email,
    role: user.role 
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email for verification.',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    },
  });
};

/**
 * Login with email/password
 */
export const login = async (req, res) => {
  const { email, password, rememberMe = false } = req.body;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.password) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Check if user is active
  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    // Log failed login attempt
    logger.warn('Failed login attempt', { email, ip: req.ip });
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Create session in Redis
  const { sessionId, refreshTokenId } = await createSession(user, rememberMe);

  // Set secure HTTP-only cookies
  setAuthCookies(res, sessionId, refreshTokenId, rememberMe);

  // Log successful login
  logger.info('User logged in successfully', { 
    userId: user.id, 
    email: user.email,
    ip: req.ip,
    rememberMe 
  });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        applicationStatus: user.applicationStatus,
      },
    },
  });
};

/**
 * Refresh session using refresh token from cookie
 */
export const refreshToken = async (req, res) => {
  // Extract refresh token from cookie
  const refreshTokenId = extractRefreshTokenFromCookie(req);

  if (!refreshTokenId) {
    throw new AuthenticationError('Refresh token is required');
  }

  // Refresh session in Redis
  const result = await refreshSession(refreshTokenId);
  
  if (!result) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  // Get user data
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
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
    throw new AuthenticationError('User not found or inactive');
  }

  // Set new session cookie (refresh token stays the same)
  const { setSessionCookie } = await import('../../../shared/utils/cookies.js');
  setSessionCookie(res, result.sessionId);

  logger.info('Session refreshed', { userId: user.id });

  res.status(200).json({
    success: true,
    message: 'Session refreshed successfully',
    data: {
      user,
    },
  });
};

/**
 * Verify email address
 */
export const verifyEmail = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Verification token is required');
  }

  // Find user by verification token
  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: token },
  });

  if (!user) {
    throw new NotFoundError('Invalid or expired verification token');
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      success: true,
      message: 'Email is already verified',
    });
  }

  // Update user as verified
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerifiedAt: new Date(),
    },
  });

  logger.info('Email verified successfully', { userId: user.id, email: user.email });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
};

/**
 * Resend email verification
 */
export const resendVerification = async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      success: true,
      message: 'Email is already verified',
    });
  }

  // Generate new verification token
  const verificationToken = generateSecureToken(32);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: verificationToken },
  });

  // Send verification email
  await emailQueue.sendWelcome({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    verificationToken,
    type: 'EMAIL_VERIFICATION',
  });

  res.status(200).json({
    success: true,
    message: 'Verification email sent successfully',
  });
};

/**
 * Forgot password - send reset token
 */
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Don't reveal if user exists for security
    return res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
    });
  }

  // Generate reset token
  const resetToken = generateSecureToken(32);
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetToken,
      passwordResetExpiry: resetTokenExpiry,
    },
  });

  // Send reset email
  await emailQueue.sendPasswordReset({
    email: user.email,
    firstName: user.firstName,
    resetToken,
  });

  logger.info('Password reset requested', { userId: user.id, email: user.email });

  res.status(200).json({
    success: true,
    message: 'If the email exists, a password reset link has been sent',
  });
};

/**
 * Reset password with token
 */
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  // Find user by reset token
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiry: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    throw new ValidationError('Invalid or expired reset token');
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiry: null,
      lastLoginAt: new Date(),
    },
  });

  logger.info('Password reset successfully', { userId: user.id, email: user.email });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
  });
};

/**
 * Change password (authenticated user)
 */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Get user with password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  });

  if (!user || !user.password) {
    throw new AuthenticationError('User not found or invalid authentication method');
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password);
  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  logger.info('Password changed successfully', { userId: user.id, email: user.email });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
};

/**
 * Google OAuth callback handler
 */
export const googleCallback = async (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    if (err) {
      logger.error('Google OAuth error:', err);
      return res.redirect(`${config.app.frontendUrl}/auth/login?error=oauth_failed`);
    }

    if (!user) {
      return res.redirect(`${config.app.frontendUrl}/auth/login?error=no_user`);
    }

    try {
      // Create session in Redis
      const { sessionId, refreshTokenId } = await createSession(user, false);

      // Set secure HTTP-only cookies
      setAuthCookies(res, sessionId, refreshTokenId, false);

      logger.info('User logged in via Google OAuth', { userId: user.id });

      // Redirect to frontend
      res.redirect(config.app.frontendUrl);
    } catch (error) {
      logger.error('Error creating session after OAuth:', error);
      res.redirect(`${config.app.frontendUrl}/auth/login?error=session_failed`);
    }
  })(req, res, next);
};

/**
 * Logout handler - destroy session and clear cookies
 */
// export const logout = async (req, res) => {
//   const userId = req.user?.id;
//   const sessionId = req.sessionId;
//   const refreshTokenId = req.sessionData?.refreshTokenId;
  
//   // Destroy session in Redis
//   await destroySession(sessionId, refreshTokenId);
  
//   // Clear auth cookies
//   clearAuthCookies(res);
  
//   logger.info('User logged out', { userId });
  
//   res.status(200).json({
//     success: true,
//     message: 'Logged out successfully',
//   });
// };
export const logout = async (req, res) => {
  // Get session identifiers directly from cookies, not from middleware.
  const sessionId = req.cookies.sessionId;
  const refreshTokenFromCookie = req.cookies.refreshToken;
  let refreshTokenId = refreshTokenFromCookie; // Use the cookie value by default

  try {
    // Optional: For extra security, we can look up the session to get the linked refreshTokenId.
    // This ensures we only delete tokens that belong together.
    if (sessionId) {
      const session = await getSession(sessionId);
      if (session?.refreshTokenId) {
        refreshTokenId = session.refreshTokenId;
      }
    }

    // Attempt to destroy the server-side session. This will not throw an error if keys don't exist.
    await destroySession(sessionId, refreshTokenId);
    
    logger.info('User session destroyed on server.', { sessionId });

  } catch (error) {
    // Even if destroying the server session fails, we must continue to clear the client cookies.
    logger.error('Error destroying server session during logout. Proceeding to clear cookies.', error);
  }
  
  // Always clear the cookies on the client's browser. This is the most important step.
  clearAuthCookies(res);
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

/**
 * Apply for seller account
 */
// export const applySeller = async (req, res) => {
//   const { 
//     businessName,
//     businessType,
//     businessAddress,
//     businessPhone,
//     businessEmail,
//     taxId,
//     businessDocuments,
//     description,
//     websiteUrl,
//     socialMediaHandles
//   } = req.body;

//   const userId = req.user.id;

//   // Validate required fields
//   if (!businessName || !businessType || !businessAddress || !businessPhone || !businessEmail) {
//     throw new ValidationError('Missing required business information');
//   }

//   // Check if user already has a pending application
//   const existingApplication = await prisma.sellerApplication.findUnique({
//     where: { userId },
//   });

//   if (existingApplication) {
//     if (existingApplication.status === 'PENDING') {
//       throw new ConflictError('You already have a pending seller application');
//     }
//     if (existingApplication.status === 'APPROVED') {
//       throw new ConflictError('Your seller application has already been approved');
//     }
//   }

//   // Create or update seller application
//   const application = await prisma.sellerApplication.upsert({
//     where: { userId },
//     update: {
//       businessName,
//       businessType,
//       businessAddress,
//       businessPhone,
//       businessEmail,
//       taxId,
//       businessDocuments,
//       description,
//       websiteUrl,
//       socialMediaHandles,
//       status: 'PENDING',
//       reviewedBy: null,
//       reviewNotes: null,
//       reviewedAt: null,
//     },
//     create: {
//       userId,
//       businessName,
//       businessType,
//       businessAddress,
//       businessPhone,
//       businessEmail,
//       taxId,
//       businessDocuments,
//       description,
//       websiteUrl,
//       socialMediaHandles,
//       status: 'PENDING',
//     },
//   });

//   // Update user application status
//   await prisma.user.update({
//     where: { id: userId },
//     data: { applicationStatus: 'PENDING' },
//   });

//   // Log audit event
//   await prisma.auditLog.create({
//     data: {
//       userId,
//       action: 'SELLER_APPLICATION_SUBMITTED',
//       entity: 'SellerApplication',
//       entityId: application.id,
//       metadata: { businessName, businessType },
//     },
//   });

//   logger.info('Seller application submitted', { userId, applicationId: application.id });

//   res.status(201).json({
//     success: true,
//     message: 'Seller application submitted successfully',
//     data: {
//       applicationId: application.id,
//       status: application.status,
//     },
//   });
// };

/**
 * Handles seller application for an existing, authenticated user.
 */
export const applySellerExistingUser = async (req, res) => {
  const userId = req.user.id; // Get user ID securely from the session
  const businessData = req.body;

  // Check if user already has a pending or approved application
  const existingApplication = await prisma.sellerApplication.findUnique({
    where: { userId },
  });

  if (existingApplication) {
    if (existingApplication.status === 'PENDING') {
      throw new ConflictError('You already have a pending seller application');
    }
    if (existingApplication.status === 'APPROVED') {
      throw new ConflictError('Your seller application has already been approved');
    }
  }

  // Create a new seller application (or update if one was previously rejected)
  const application = await prisma.sellerApplication.upsert({
    where: { userId },
    update: { ...businessData, status: 'PENDING', reviewedAt: null, reviewNotes: null },
    create: { userId, ...businessData, status: 'PENDING' },
  });

  // Update the user's application status
  await prisma.user.update({
    where: { id: userId },
    data: { applicationStatus: 'PENDING' },
  });

  // Log the audit event
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'SELLER_APPLICATION_SUBMITTED',
      entity: 'SellerApplication',
      entityId: application.id,
      metadata: { businessName: businessData.businessName, isNewUser: false },
    },
  });

  logger.info('Seller application submitted by existing user', { 
    userId, 
    applicationId: application.id 
  });

  res.status(201).json({
    success: true,
    message: 'Your seller application has been submitted successfully',
    data: {
      applicationId: application.id,
      status: application.status,
    },
  });
};

/**
 * Handles registration and seller application for a NEW user.
 */
export const applySellerNewUser = async (req, res) => {
  const { 
    businessName, businessType, businessAddress, businessPhone, businessEmail, 
    taxId, businessDocuments, description, websiteUrl, socialMediaHandles,
    email, password, firstName, lastName, phone, dateOfBirth
  } = req.body;

  // Validate required fields (can be handled by Joi validation middleware)

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    // Force existing users to log in and use the correct endpoint
    throw new ConflictError('An account with this email already exists. Please log in and apply from your dashboard.');
  }

  // --- Create new user account (since user does not exist) ---
  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = generateSecureToken(32);

  const newUser = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'CUSTOMER', // User starts as a customer
      applicationStatus: 'PENDING',
      phone: phone || businessPhone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      emailVerificationToken: verificationToken,
      isEmailVerified: false,
      isActive: true,
    },
  });

  // Create the seller application associated with the new user
  const application = await prisma.sellerApplication.create({
    data: {
      userId: newUser.id,
      businessName, businessType, businessAddress, businessPhone, businessEmail,
      taxId, businessDocuments, description, websiteUrl, socialMediaHandles,
      status: 'PENDING',
    },
  });

  // --- Post-creation tasks (email, logging) ---
  await emailQueue.sendWelcome({
    email: newUser.email,
    firstName: newUser.firstName,
    verificationToken,
    type: 'EMAIL_VERIFICATION',
  });
  
  await prisma.auditLog.create({
    data: {
      userId: newUser.id,
      action: 'SELLER_APPLICATION_WITH_REGISTRATION',
      entity: 'User',
      entityId: newUser.id,
    },
  });

  logger.info('New user registered via seller application', { userId: newUser.id });

  res.status(201).json({
    success: true,
    message: 'Registration and application submitted successfully. Please check your email for verification.',
    data: {
      applicationId: application.id,
      status: application.status,
      userCreated: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: 'CUSTOMER',
      },
    },
  });
};

/**
 * Check application status
 */
export const applicationStatus = async (req, res) => {
  const userId = req.user.id;

  const application = await prisma.sellerApplication.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      businessName: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  if (!application) {
    return res.status(200).json({
      success: true,
      data: {
        hasApplication: false,
        message: 'No seller application found',
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      hasApplication: true,
      application,
    },
  });
};

/**
 * Approve seller application (Super Admin only)
 */
export const approveSeller = async (req, res) => {
  const { applicationId } = req.params;
  const { reviewNotes } = req.body;
  const adminId = req.user.id;

  // Get application
  const application = await prisma.sellerApplication.findUnique({
    where: { id: applicationId },
    include: { user: true },
  });

  if (!application) {
    throw new NotFoundError('Application');
  }

  if (application.status !== 'PENDING') {
    throw new ConflictError('Application has already been processed');
  }

  // Begin transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update application
    const updatedApplication = await tx.sellerApplication.update({
      where: { id: applicationId },
      data: {
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewNotes,
        reviewedAt: new Date(),
      },
    });

    // Update user role and status
    const updatedUser = await tx.user.update({
      where: { id: application.userId },
      data: {
        role: 'SELLER',
        applicationStatus: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    // Create finance record for the new seller
    await tx.finance.create({
      data: {
        sellerId: application.userId,
        totalEarnings: 0,
        availableBalance: 0,
        pendingBalance: 0,
        withdrawnAmount: 0,
      },
    });

    // Log audit event
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'SELLER_APPLICATION_APPROVED',
        entity: 'SellerApplication',
        entityId: applicationId,
        changes: {
          before: { status: 'PENDING' },
          after: { status: 'APPROVED' },
        },
      },
    });

    return { updatedApplication, updatedUser };
  });

  // Send welcome email to new seller
  await emailQueue.sendWelcome({
    email: application.user.email,
    firstName: application.user.firstName,
    lastName: application.user.lastName,
    businessName: application.businessName,
  });

  logger.info('Seller application approved', { 
    applicationId, 
    userId: application.userId,
    approvedBy: adminId 
  });

  res.status(200).json({
    success: true,
    message: 'Seller application approved successfully',
    data: {
      applicationId: result.updatedApplication.id,
      userId: result.updatedUser.id,
    },
  });
};

/**
 * Create manager account (Seller only)
 */
// export const createManager = async (req, res) => {
//   const { name, email, password, phone, permissions } = req.body;
//   const sellerId = req.user.id;

//   // Validate required fields
//   if (!name || !email || !password) {
//     throw new ValidationError('Name, email, and password are required');
//   }

//   // Check if email is already in use
//   const existingManager = await prisma.manager.findUnique({
//     where: { email },
//   });

//   if (existingManager) {
//     throw new ConflictError('Email is already registered as a manager');
//   }

//   // Hash password
//   const hashedPassword = hashPassword(password);

//   // Create manager
//   const manager = await prisma.manager.create({
//     data: {
//       sellerId,
//       name,
//       email,
//       password: hashedPassword,
//       phone,
//       permissions: permissions || [],
//     },
//   });

//   // Send email to manager with login details
//   await emailQueue.sendWelcome({
//     email,
//     name,
//     type: 'MANAGER',
//     sellerId,
//   });

//   // Log audit event
//   await prisma.auditLog.create({
//     data: {
//       userId: sellerId,
//       action: 'MANAGER_CREATED',
//       entity: 'Manager',
//       entityId: manager.id,
//       metadata: { managerEmail: email, managerName: name },
//     },
//   });

//   logger.info('Manager created', { managerId: manager.id, sellerId });

//   res.status(201).json({
//     success: true,
//     message: 'Manager created successfully',
//     data: {
//       managerId: manager.id,
//       name: manager.name,
//       email: manager.email,
//     },
//   });
// };

export const createManager = async (req, res) => {
  const { name, email, phone, permissions } = req.body;
  const sellerId = req.user.id;

  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }

  const existingManager = await prisma.manager.findUnique({ where: { email } });
  if (existingManager) {
    throw new ConflictError('Email is already registered as a manager');
  }

  // Generate invitation token
  const invitationToken = generateSecureToken(32);
  const invitationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to accept

  // Create an inactive manager with an invitation token
  const manager = await prisma.manager.create({
    data: {
      sellerId,
      name,
      email,
      phone,
      permissions: permissions || [],
      isActive: false,
      invitationToken,
      invitationExpiry,
    },
  });

  // Send invitation email via RabbitMQ
  await emailQueue.sendManagerInvitation({
    email: manager.email,
    name: manager.name,
    invitationToken,
    sellerName: req.user.firstName,
    // type: 'MANAGER_INVITATION',
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'MANAGER_INVITED',
      entity: 'Manager',
      entityId: manager.id,
      metadata: { managerEmail: email, managerName: name },
    },
  });

  logger.info('Manager invited', { managerId: manager.id, sellerId });

  res.status(201).json({
    success: true,
    message: 'Manager invitation sent successfully',
    data: {
      managerId: manager.id,
      name: manager.name,
      email: manager.email,
    },
  });
};

/**
 * Accept Manager Invitation (New Controller)
 */
export const acceptManagerInvitation = async (req, res) => {
  const { token, password } = req.body;

  // Find manager by token and check expiry
  const manager = await prisma.manager.findFirst({
    where: {
      invitationToken: token,
      invitationExpiry: { gt: new Date() },
    },
  });

  if (!manager) {
    throw new ValidationError('Invalid or expired invitation token');
  }

  // Hash the password and activate the manager
  const hashedPassword = await hashPassword(password);

  await prisma.manager.update({
    where: { id: manager.id },
    data: {
      password: hashedPassword,
      isActive: true,
      invitationToken: null, // Nullify token after use
      invitationExpiry: null,
    },
  });

  logger.info('Manager account activated', { managerId: manager.id, email: manager.email });

  res.status(200).json({
    success: true,
    message: 'Account activated successfully. You can now log in.',
  });
};


/**
 * Deactivate manager (Seller only)
 */
export const deactivateManager = async (req, res) => {
  const { managerId } = req.params;
  const sellerId = req.user.id;

  // Get manager
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
  });

  if (!manager) {
    throw new NotFoundError('Manager');
  }

  // Verify ownership
  if (manager.sellerId !== sellerId) {
    throw new AuthorizationError('You can only deactivate your own managers');
  }

  if (!manager.isActive) {
    throw new ConflictError('Manager is already deactivated');
  }

  // Deactivate manager
  const updatedManager = await prisma.manager.update({
    where: { id: managerId },
    data: { isActive: false },
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'MANAGER_DEACTIVATED',
      entity: 'Manager',
      entityId: managerId,
      metadata: { managerEmail: manager.email },
    },
  });

  logger.info('Manager deactivated', { managerId, sellerId });

  res.status(200).json({
    success: true,
    message: 'Manager deactivated successfully',
    data: {
      managerId: updatedManager.id,
      isActive: updatedManager.isActive,
    },
  });
};

/**
 * Get user profile
 */
export const profile = async (req, res) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      profilePicture: true,
      role: true,
      applicationStatus: true,
      createdAt: true,
      sellerApplication: {
        select: {
          businessName: true,
          businessType: true,
          status: true,
        },
      },
      _count: {
        select: {
          bookings: true,
          campaigns: true,
          managers: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  res.status(200).json({
    success: true,
    data: {
      user,
    },
  });
};