import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../../config/index.js';

const algorithm = config.security.encryption.algorithm || 'aes-256-gcm';
// Ensure key is 32 bytes
const secretKey = Buffer.from((config.security.encryption.key || '').padEnd(32, '0').slice(0, 32));
const qrSecret = config.ticket.qrCodeSecret || 'default_qr_secret_change_me';
/**
 * Encrypt text using AES-256-GCM
 */
export const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

/**
 * Decrypt text encrypted with AES-256-GCM
 */
export const decrypt = (encryptedData) => {
  const data = Buffer.from(encryptedData, 'base64');
  
  const iv = data.slice(0, 16);
  const authTag = data.slice(16, 32);
  const encrypted = data.slice(32);
  
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
};

/**
 * Generate a secure random token
 */
export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hashes a password using bcrypt.
 * This is an async function.
 * @param {string} password The plaintext password.
 * @returns {Promise<string>} The hashed password.
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

/**
 * Verifies a password against a bcrypt hash.
 * This is an async function.
 * @param {string} password The plaintext password to verify.
 * @param {string} hashedPassword The hash to compare against.
 * @returns {Promise<boolean>} True if the password is a match.
 */
export const verifyPassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// /**
//  * Generate QR code data with encryption
//  */
// export const generateQRData = (ticketData) => {
//   const timestamp = Date.now();
//   const data = {
//     ticketId: ticketData.id,
//     ticketNumber: ticketData.ticketNumber,
//     campaignId: ticketData.campaignId,
//     customerId: ticketData.customerId,
//     timestamp,
//     nonce: crypto.randomBytes(8).toString('hex'),
//   };
  
//   // Create signature
//   const signatureData = JSON.stringify(data);
//   const signature = crypto
//     .createHmac('sha256', config.ticket.qrCodeSecret)
//     .update(signatureData)
//     .digest('hex');
  
//   // Encrypt the data
//   const encryptedData = encrypt(JSON.stringify({ ...data, signature }));
  
//   return encryptedData;
// };

// /**
//  * Verify and decrypt QR code data
//  */
// export const verifyQRData = (encryptedData) => {
//   try {
//     const decryptedData = decrypt(encryptedData);
//     const data = JSON.parse(decryptedData);
    
//     // Verify signature
//     const { signature, ...originalData } = data;
//     const expectedSignature = crypto
//       .createHmac('sha256', config.ticket.qrCodeSecret)
//       .update(JSON.stringify(originalData))
//       .digest('hex');
    
//     if (signature !== expectedSignature) {
//       return { valid: false, error: 'Invalid signature' };
//     }
    
//     // Check timestamp (prevent replay attacks)
//     const now = Date.now();
//     const age = now - originalData.timestamp;
//     const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
//     if (age > maxAge) {
//       return { valid: false, error: 'QR code expired' };
//     }
    
//     return { valid: true, data: originalData };
//   } catch (error) {
//     return { valid: false, error: 'Invalid QR code' };
//   }
// };

/**
 * Generate QR code data with encryption
 */
export const generateQRData = (ticketData) => {
  // We keep timestamp for audit/versioning, but won't fail validation on it
  const timestamp = Date.now();
  
  const data = {
    ticketId: ticketData.id || ticketData.ticketId, // Handle both formats
    ticketNumber: ticketData.ticketNumber,
    campaignId: ticketData.campaignId,
    // Add a random nonce to ensure every generated QR is unique (even for same ticket)
    nonce: crypto.randomBytes(8).toString('hex'), 
    timestamp,
  };
  
  // Create signature
  const signatureData = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', qrSecret)
    .update(signatureData)
    .digest('hex');
  
  // Encrypt the data
  // Result is: Encrypted( JSON( Data + Signature ) )
  return encrypt(JSON.stringify({ ...data, signature }));
};

/**
 * Verify and decrypt QR code data
 * FIX: Removed 24-hour expiration check
 */
export const verifyQRData = (encryptedData) => {
  try {
    const decryptedData = decrypt(encryptedData);
    const data = JSON.parse(decryptedData);
    
    // Verify signature
    const { signature, ...originalData } = data;
    const expectedSignature = crypto
      .createHmac('sha256', qrSecret)
      .update(JSON.stringify(originalData))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid QR signature (Forgery Detected)' };
    }
    
    // FIX: Removed the "age > maxAge" check. 
    // Ticket validity depends on the Event Date (checked in Service), not QR creation time.
    
    return { valid: true, data: originalData };
  } catch (error) {
    return { valid: false, error: 'Invalid or Malformed QR code' };
  }
};


/**
 * Generate a unique identifier
 */
export const generateUniqueId = (prefix = '') => {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(4).toString('hex');
  return prefix ? `${prefix}_${timestamp}${randomPart}` : `${timestamp}${randomPart}`;
};

/**
 * Mask sensitive data for logging
 */
export const maskSensitiveData = (data) => {
  const sensitive = ['password', 'token', 'secret', 'key', 'cardNumber', 'cvv'];
  const masked = { ...data };
  
  Object.keys(masked).forEach(key => {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      masked[key] = '***MASKED***';
    }
  });
  
  return masked;
};