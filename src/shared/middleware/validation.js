import { ValidationError } from '../errors/AppError.js';

/**
 * Validate request data against Joi schema
 */
export const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      let dataToValidate;

      switch (source) {
        case 'params':
          dataToValidate = req.params;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'headers':
          dataToValidate = req.headers;
          break;
        case 'body':
        default:
          dataToValidate = req.body;
          break;
      }

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false, // Return all validation errors
        allowUnknown: false, // Don't allow unknown fields
        stripUnknown: true, // Remove unknown fields
      });

      if (error) {
        const errorMessage = error.details
          .map(detail => detail.message)
          .join('; ');
        
        throw new ValidationError(errorMessage, error.details);
      }

      // Replace request data with validated/sanitized data
      if (source === 'params') {
        req.params = value;
      } else if (source === 'query') {
        req.query = value;
      } else if (source === 'headers') {
        req.headers = { ...req.headers, ...value };
      } else {
        req.body = value;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Validate multiple sources (body, params, query)
 */
export const validateMultiple = (schemas) => {
  return (req, res, next) => {
    try {
      const validatedData = {};
      const errors = [];

      // Validate each schema
      for (const [source, schema] of Object.entries(schemas)) {
        if (!schema) continue;

        let dataToValidate;
        switch (source) {
          case 'params':
            dataToValidate = req.params;
            break;
          case 'query':
            dataToValidate = req.query;
            break;
          case 'headers':
            dataToValidate = req.headers;
            break;
          case 'body':
          default:
            dataToValidate = req.body;
            break;
        }

        const { error, value } = schema.validate(dataToValidate, {
          abortEarly: false,
          allowUnknown: false,
          stripUnknown: true,
        });

        if (error) {
          errors.push(...error.details.map(detail => `${source}: ${detail.message}`));
        } else {
          validatedData[source] = value;
        }
      }

      if (errors.length > 0) {
        throw new ValidationError(errors.join('; '));
      }

      // Update request with validated data
      Object.entries(validatedData).forEach(([source, value]) => {
        if (source === 'params') {
          req.params = value;
        } else if (source === 'query') {
          req.query = value;
        } else if (source === 'headers') {
          req.headers = { ...req.headers, ...value };
        } else if (source === 'body') {
          req.body = value;
        }
      });

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Sanitize and validate file uploads
 */
export const validateFileUpload = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxFiles = 1,
    fieldName = 'file'
  } = options;

  return (req, res, next) => {
    try {
      const files = req.files || (req.file ? [req.file] : []);
      
      if (files.length === 0) {
        return next(); // No files to validate
      }

      if (files.length > maxFiles) {
        throw new ValidationError(`Maximum ${maxFiles} file(s) allowed`);
      }

      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          throw new ValidationError(`File size must not exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
        }

        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          throw new ValidationError(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
        }

        // Additional security checks
        if (!file.originalname || file.originalname.length > 255) {
          throw new ValidationError('Invalid filename');
        }

        // Check for potentially dangerous file extensions
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
        const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
        
        if (dangerousExtensions.includes(fileExtension)) {
          throw new ValidationError('File type not allowed for security reasons');
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};