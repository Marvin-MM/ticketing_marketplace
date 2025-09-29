import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { ValidationError } from '../../../shared/errors/AppError.js';
import logger from '../../../config/logger.js';
import config from '../../../config/index.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Allowed image formats and their MIME types
 */
const ALLOWED_FORMATS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg', 
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_CAMPAIGN = 10;

/**
 * Validate uploaded image files
 */
const validateImageFile = (file) => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(`File ${file.originalname} exceeds maximum size of 10MB`);
  }

  // Check file format
  if (!ALLOWED_FORMATS[file.mimetype]) {
    throw new ValidationError(`File ${file.originalname} has unsupported format. Allowed: JPEG, PNG, GIF, WebP`);
  }

  // Check filename
  if (!file.originalname || file.originalname.length > 255) {
    throw new ValidationError('Invalid filename');
  }

  // Check for potentially dangerous extensions
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.php'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (dangerousExtensions.includes(fileExtension)) {
    throw new ValidationError('File type not allowed for security reasons');
  }
};

/**
 * Process image using Sharp
 */
const processImage = async (buffer, options = {}) => {
  const {
    width = 1200,
    height = 800,
    quality = 85,
    format = 'jpeg',
    fit = 'cover'
  } = options;

  try {
    let processor = sharp(buffer)
      .resize(width, height, { fit })
      .jpeg({ quality, progressive: true });

    // Handle different output formats
    switch (format) {
      case 'png':
        processor = sharp(buffer).resize(width, height, { fit }).png({ quality });
        break;
      case 'webp':
        processor = sharp(buffer).resize(width, height, { fit }).webp({ quality });
        break;
      case 'gif':
        // For GIFs, we'll convert to WebP to maintain quality and reduce size
        processor = sharp(buffer).resize(width, height, { fit }).webp({ quality });
        break;
      default:
        // Default to JPEG
        break;
    }

    return await processor.toBuffer();
  } catch (error) {
    logger.error('Image processing failed:', error);
    throw new ValidationError('Failed to process image. Please ensure it is a valid image file.');
  }
};

/**
 * Upload image to Cloudinary
 */
const uploadToCloudinary = async (buffer, options = {}) => {
  const {
    folder = 'campaigns',
    campaignId,
    imageType = 'image',
    transformation = []
  } = options;

  try {
    const uploadOptions = {
      folder: `${folder}/${campaignId}`,
      public_id: `${imageType}_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { width: 1200, height: 800, crop: 'fill' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
        ...transformation
      ]
    };

    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${buffer.toString('base64')}`,
      uploadOptions
    );

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes
    };
  } catch (error) {
    logger.error('Cloudinary upload failed:', error);
    throw new ValidationError('Failed to upload image. Please try again.');
  }
};

/**
 * Upload campaign cover image
 */
export const uploadCoverImage = async (file, campaignId) => {
  validateImageFile(file);

  // Process image for cover (optimized for hero display)
  const processedImage = await processImage(file.buffer, {
    width: 1200,
    height: 600,
    quality: 90,
    format: 'jpeg',
    fit: 'cover'
  });

  // Upload to Cloudinary with cover-specific transformations
  const uploadResult = await uploadToCloudinary(processedImage, {
    campaignId,
    imageType: 'cover',
    transformation: [
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
      // Generate thumbnails
      { width: 400, height: 200, crop: 'fill', quality: 'auto:low' },
      { width: 800, height: 400, crop: 'fill', quality: 'auto:good' }
    ]
  });

  logger.info('Cover image uploaded successfully', {
    campaignId,
    url: uploadResult.url,
    size: uploadResult.bytes
  });

  return uploadResult;
};

/**
 * Upload multiple campaign gallery images
 */
export const uploadGalleryImages = async (files, campaignId, existingImagesCount = 0) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new ValidationError('No files provided');
  }

  if (files.length + existingImagesCount > MAX_FILES_PER_CAMPAIGN) {
    throw new ValidationError(`Cannot upload more than ${MAX_FILES_PER_CAMPAIGN} images per campaign`);
  }

  // Validate all files first
  files.forEach(validateImageFile);

  const uploadPromises = files.map(async (file, index) => {
    try {
      // Process image for gallery
      const processedImage = await processImage(file.buffer, {
        width: 800,
        height: 600,
        quality: 85,
        format: 'jpeg',
        fit: 'cover'
      });

      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(processedImage, {
        campaignId,
        imageType: `gallery_${index + existingImagesCount + 1}`,
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
          // Generate thumbnail
          { width: 300, height: 200, crop: 'fill', quality: 'auto:low' }
        ]
      });

      return {
        originalName: file.originalname,
        ...uploadResult
      };
    } catch (error) {
      logger.error('Gallery image upload failed:', {
        filename: file.originalname,
        error: error.message
      });
      throw new ValidationError(`Failed to upload ${file.originalname}: ${error.message}`);
    }
  });

  const results = await Promise.all(uploadPromises);

  logger.info('Gallery images uploaded successfully', {
    campaignId,
    count: results.length,
    totalSize: results.reduce((sum, result) => sum + result.bytes, 0)
  });

  return results;
};

/**
 * Delete image from Cloudinary
 */
export const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error('Failed to delete image from Cloudinary');
    }

    logger.info('Image deleted successfully', { publicId });
    return result;
  } catch (error) {
    logger.error('Failed to delete image:', { publicId, error: error.message });
    throw new ValidationError('Failed to delete image');
  }
};

/**
 * Generate image variants (thumbnails, different sizes)
 */
export const generateImageVariants = async (publicId, variants = []) => {
  try {
    const defaultVariants = [
      { width: 150, height: 150, crop: 'fill', quality: 'auto:low', suffix: 'thumb' },
      { width: 400, height: 300, crop: 'fill', quality: 'auto:good', suffix: 'small' },
      { width: 800, height: 600, crop: 'fill', quality: 'auto:good', suffix: 'medium' }
    ];

    const variantsToGenerate = variants.length > 0 ? variants : defaultVariants;
    const urls = {};

    for (const variant of variantsToGenerate) {
      const { suffix, ...transformation } = variant;
      urls[suffix] = cloudinary.url(publicId, {
        transformation: [transformation],
        secure: true
      });
    }

    return urls;
  } catch (error) {
    logger.error('Failed to generate image variants:', { publicId, error: error.message });
    throw new ValidationError('Failed to generate image variants');
  }
};

/**
 * Optimize existing image URL
 */
export const optimizeImageUrl = (imageUrl, options = {}) => {
  try {
    // Extract public ID from Cloudinary URL
    const matches = imageUrl.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)$/i);
    if (!matches) {
      return imageUrl; // Return original if not a Cloudinary URL
    }

    const publicId = matches[1];
    const {
      width = 800,
      height = 600,
      quality = 'auto',
      format = 'auto'
    } = options;

    return cloudinary.url(publicId, {
      transformation: [
        { width, height, crop: 'fill' },
        { quality },
        { fetch_format: format }
      ],
      secure: true
    });
  } catch (error) {
    logger.warn('Failed to optimize image URL:', { imageUrl, error: error.message });
    return imageUrl; // Return original URL if optimization fails
  }
};

/**
 * Validate image URLs
 */
export const validateImageUrls = (urls) => {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls.filter(url => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  });
};

/**
 * Get image metadata from Cloudinary
 */
export const getImageMetadata = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      url: result.secure_url,
      createdAt: result.created_at
    };
  } catch (error) {
    logger.error('Failed to get image metadata:', { publicId, error: error.message });
    return null;
  }
};

/**
 * Clean up campaign images when campaign is deleted
 */
export const cleanupCampaignImages = async (campaignId) => {
  try {
    // Get all images in the campaign folder
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: `campaigns/${campaignId}`,
      max_results: 100
    });

    if (result.resources && result.resources.length > 0) {
      const publicIds = result.resources.map(resource => resource.public_id);
      
      // Delete all images
      const deleteResult = await cloudinary.api.delete_resources(publicIds);
      
      logger.info('Campaign images cleaned up', {
        campaignId,
        deletedCount: Object.keys(deleteResult.deleted).length
      });

      return deleteResult;
    }

    return { deleted: {} };
  } catch (error) {
    logger.error('Failed to cleanup campaign images:', {
      campaignId,
      error: error.message
    });
    throw new ValidationError('Failed to cleanup campaign images');
  }
};

export default {
  uploadCoverImage,
  uploadGalleryImages,
  deleteImage,
  generateImageVariants,
  optimizeImageUrl,
  validateImageUrls,
  getImageMetadata,
  cleanupCampaignImages
};