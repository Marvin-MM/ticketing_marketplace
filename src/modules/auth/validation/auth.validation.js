import Joi from 'joi';

/**
 * User registration validation schema
 */
export const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'any.required': 'Password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Password confirmation does not match',
      'any.required': 'Password confirmation is required'
    }),

  firstName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters and spaces',
      'any.required': 'First name is required'
    }),

  lastName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 50 characters',
      'string.pattern.base': 'Last name can only contain letters and spaces',
      'any.required': 'Last name is required'
    }),

  role: Joi.string()
    .valid('CUSTOMER', 'SELLER')
    .default('CUSTOMER')
    .messages({
      'any.only': 'Role must be either CUSTOMER or SELLER'
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please enter a valid phone number'
    }),

  dateOfBirth: Joi.date()
    .max('now')
    .min('1900-01-01')
    .optional()
    .messages({
      'date.max': 'Date of birth cannot be in the future',
      'date.min': 'Date of birth is invalid'
    }),

  termsAccepted: Joi.boolean()
    .valid(true)
    .required()
    .messages({
      'any.only': 'You must accept the terms and conditions'
    })
});

/**
 * User login validation schema
 */
export const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    }),

  rememberMe: Joi.boolean()
    .default(false)
});

/**
 * Forgot password validation schema
 */
export const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    })
});

/**
 * Reset password validation schema
 */
export const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required'
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'any.required': 'Password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Password confirmation does not match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * Change password validation schema
 */
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),

  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'any.required': 'New password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Password confirmation does not match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * Update profile validation schema
 */
export const updateProfileSchema = Joi.object({
  firstName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .optional()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters and spaces'
    }),

  lastName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .optional()
    .messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 50 characters',
      'string.pattern.base': 'Last name can only contain letters and spaces'
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .allow(null, '')
    .optional()
    .messages({
      'string.pattern.base': 'Please enter a valid phone number'
    }),

  dateOfBirth: Joi.date()
    .max('now')
    .min('1900-01-01')
    .allow(null)
    .optional()
    .messages({
      'date.max': 'Date of birth cannot be in the future',
      'date.min': 'Date of birth is invalid'
    }),

  bio: Joi.string()
    .max(500)
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Bio must not exceed 500 characters'
    })
});

/**
 * Seller application validation schema
 */
export const sellerApplicationSchema = Joi.object({
  businessName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Business name must be at least 2 characters long',
      'string.max': 'Business name must not exceed 100 characters',
      'any.required': 'Business name is required'
    }),

  businessType: Joi.string()
    .valid('individual', 'company', 'organization', 'other')
    .required()
    .messages({
      'any.only': 'Please select a valid business type',
      'any.required': 'Business type is required'
    }),

  businessAddress: Joi.string()
    .min(10)
    .max(200)
    .required()
    .messages({
      'string.min': 'Business address must be at least 10 characters long',
      'string.max': 'Business address must not exceed 200 characters',
      'any.required': 'Business address is required'
    }),

  businessPhone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Please enter a valid business phone number',
      'any.required': 'Business phone is required'
    }),

  businessEmail: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid business email address',
      'any.required': 'Business email is required'
    }),

  taxId: Joi.string()
    .alphanum()
    .min(8)
    .max(20)
    .optional()
    .messages({
      'string.alphanum': 'Tax ID can only contain letters and numbers',
      'string.min': 'Tax ID must be at least 8 characters long',
      'string.max': 'Tax ID must not exceed 20 characters'
    }),

  businessDocuments: Joi.array()
    .items(Joi.string().uri())
    .max(5)
    .optional()
    .messages({
      'array.max': 'You can upload maximum 5 business documents'
    }),

  description: Joi.string()
    .max(1000)
    .optional()
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),

  websiteUrl: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'Please enter a valid website URL'
    }),

  socialMediaHandles: Joi.object({
    facebook: Joi.string().uri().optional(),
    twitter: Joi.string().uri().optional(),
    instagram: Joi.string().uri().optional(),
    linkedin: Joi.string().uri().optional()
  }).optional()
});

/**
 * Create manager validation schema
 */
export const createManagerSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 100 characters',
      'string.pattern.base': 'Name can only contain letters and spaces',
      'any.required': 'Name is required'
    }),

  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'any.required': 'Password is required'
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please enter a valid phone number'
    }),

  permissions: Joi.array()
    .items(Joi.string().valid(
      'CREATE_CAMPAIGNS',
      'EDIT_CAMPAIGNS',
      'DELETE_CAMPAIGNS',
      'VIEW_ANALYTICS',
      'MANAGE_BOOKINGS',
      'VALIDATE_TICKETS'
    ))
    .optional()
    .messages({
      'array.includes': 'Invalid permission specified'
    })
});

/**
 * Review seller application validation schema
 */
export const reviewApplicationSchema = Joi.object({
  reviewNotes: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Review notes must not exceed 500 characters'
    })
});

/**
 * Refresh token validation schema
 */
export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

/**
 * Email verification schema
 */
export const verifyEmailSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Verification token is required'
    })
});