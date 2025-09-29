import prisma from '../../../config/database.js';
import logger from '../../../config/logger.js';
import { cache } from '../../../config/redis.js';
import { 
  ValidationError, 
  NotFoundError, 
  AuthorizationError,
  ConflictError 
} from '../../../shared/errors/AppError.js';
import { generateUniqueId } from '../../../shared/utils/encryption.js';
import searchService from '../services/searchService.js';
import imageService from '../services/imageService.js';
import { validateRequest } from '../../../shared/middleware/validation.js';
import { 
  createCampaignSchema,
  updateCampaignSchema,
  updateCampaignStatusSchema,
  assignManagersSchema 
} from '../validation/campaign.validation.js';

/**
 * Create a new campaign
 */
export const createCampaign = async (req, res) => {
  const sellerId = req.user.id;
  const {
    title,
    description,
    eventType,
    ticketTypes,
    maxPerCustomer,
    startDate,
    endDate,
    eventDate,
    venue,
    venueAddress,
    venueCity,
    venueCountry,
    coverImage,
    images,
    isMultiScan,
    maxScansPerTicket,
    tags,
    metadata,
  } = req.body;

  // Validate ticket types structure
  if (!ticketTypes || typeof ticketTypes !== 'object' || Object.keys(ticketTypes).length === 0) {
    throw new ValidationError('At least one ticket type is required');
  }

  // Calculate total quantity from ticket types
  let totalQuantity = 0;
  for (const [key, type] of Object.entries(ticketTypes)) {
    if (!type.price || !type.quantity || !type.description) {
      throw new ValidationError(`Ticket type ${key} must have price, quantity, and description`);
    }
    totalQuantity += type.quantity;
  }

  // Create campaign
  const campaign = await prisma.ticketCampaign.create({
    data: {
      sellerId,
      title,
      description,
      eventType,
      ticketTypes,
      totalQuantity,
      soldQuantity: 0,
      maxPerCustomer: maxPerCustomer || 10,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      eventDate: new Date(eventDate),
      venue,
      venueAddress,
      venueCity,
      venueCountry,
      coverImage,
      images: images || [],
      status: 'DRAFT',
      isMultiScan: isMultiScan || false,
      maxScansPerTicket: maxScansPerTicket || 1,
      tags: tags || [],
      metadata: metadata || {},
    },
  });

  // Create initial analytics record
  await prisma.campaignAnalytics.create({
    data: {
      campaignId: campaign.id,
      totalViews: 0,
      uniqueViews: 0,
      totalBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      totalRevenue: 0,
      averageTicketPrice: 0,
      conversionRate: 0,
    },
  });

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'CAMPAIGN_CREATED',
      entity: 'TicketCampaign',
      entityId: campaign.id,
      metadata: { title, eventType, totalQuantity },
    },
  });

  logger.info('Campaign created', { campaignId: campaign.id, sellerId });

  res.status(201).json({
    success: true,
    message: 'Campaign created successfully',
    data: { campaign },
  });
};

/**
 * Get all active campaigns (public) - Enhanced with search service
 */
export const getAllCampaigns = async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    search,
    eventType, 
    city, 
    status = 'ACTIVE',
    sortBy = 'eventDate',
    sortOrder = 'asc',
    priceMin,
    priceMax,
    dateFrom,
    dateTo,
    tags,
    availability
  } = req.query;

  try {
    const filters = {
      search,
      eventType,
      city,
      status,
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
      dateFrom,
      dateTo,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : undefined,
      availability,
      sortBy,
      sortOrder
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await searchService.searchCampaigns(filters, pagination);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Get campaigns error:', error);
    throw error;
  }
};

/**
 * Get campaign by ID
 */
export const getCampaignById = async (req, res) => {
  const { campaignId } = req.params;

  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    include: {
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          sellerApplication: {
            select: {
              businessName: true,
              businessType: true,
            },
          },
        },
      },
      managers: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      analytics: true,
      _count: {
        select: {
          bookings: true,
          tickets: true,
          validations: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  // Update view count
  await prisma.campaignAnalytics.update({
    where: { campaignId },
    data: {
      totalViews: { increment: 1 },
    },
  });

  res.status(200).json({
    success: true,
    data: { campaign },
  });
};

/**
 * Update campaign
 */
export const updateCampaign = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;
  const updates = req.body;

  // Get campaign
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  // Verify ownership
  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only update your own campaigns');
  }

  // Don't allow updates to active campaigns
  if (campaign.status === 'ACTIVE' && !['status', 'endDate'].includes(Object.keys(updates)[0])) {
    throw new ConflictError('Cannot update active campaign details');
  }

  // Recalculate total quantity if ticket types are updated
  if (updates.ticketTypes) {
    let totalQuantity = 0;
    for (const type of Object.values(updates.ticketTypes)) {
      totalQuantity += type.quantity;
    }
    updates.totalQuantity = totalQuantity;
  }

  // Update campaign
  const updatedCampaign = await prisma.ticketCampaign.update({
    where: { id: campaignId },
    data: updates,
  });

  // Clear cache
  await cache.clearPattern('campaigns:*');

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'CAMPAIGN_UPDATED',
      entity: 'TicketCampaign',
      entityId: campaignId,
      changes: { before: campaign, after: updatedCampaign },
    },
  });

  logger.info('Campaign updated', { campaignId, sellerId });

  res.status(200).json({
    success: true,
    message: 'Campaign updated successfully',
    data: { campaign: updatedCampaign },
  });
};

/**
 * Delete campaign
 */
export const deleteCampaign = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;

  // Get campaign
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: {
        select: {
          bookings: true,
          tickets: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  // Verify ownership
  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only delete your own campaigns');
  }

  // Don't allow deletion if there are bookings
  if (campaign._count.bookings > 0) {
    throw new ConflictError('Cannot delete campaign with existing bookings');
  }

  // Soft delete by setting status to CANCELLED
  const deletedCampaign = await prisma.ticketCampaign.update({
    where: { id: campaignId },
    data: { status: 'CANCELLED' },
  });

  // Clear cache
  await cache.clearPattern('campaigns:*');

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'CAMPAIGN_DELETED',
      entity: 'TicketCampaign',
      entityId: campaignId,
    },
  });

  logger.info('Campaign deleted', { campaignId, sellerId });

  res.status(200).json({
    success: true,
    message: 'Campaign deleted successfully',
  });
};

/**
 * Get seller's campaigns
 */
export const getSellerCampaigns = async (req, res) => {
  const sellerId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  const skip = (page - 1) * limit;

  const where = {
    sellerId,
    ...(status && { status }),
  };

  const [campaigns, total] = await Promise.all([
    prisma.ticketCampaign.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        analytics: {
          select: {
            totalViews: true,
            totalBookings: true,
            completedBookings: true,
            totalRevenue: true,
          },
        },
        _count: {
          select: {
            bookings: true,
            tickets: true,
          },
        },
      },
    }),
    prisma.ticketCampaign.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

/**
 * Update campaign status
 */
export const updateCampaignStatus = async (req, res) => {
  const { campaignId } = req.params;
  const { status } = req.body;
  const sellerId = req.user.id;

  const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError('Invalid campaign status');
  }

  // Get campaign
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  // Verify ownership
  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only update your own campaigns');
  }

  // Update status
  const updatedCampaign = await prisma.ticketCampaign.update({
    where: { id: campaignId },
    data: { status },
  });

  // Clear cache
  await cache.clearPattern('campaigns:*');

  // Log audit event
  await prisma.auditLog.create({
    data: {
      userId: sellerId,
      action: 'CAMPAIGN_STATUS_UPDATED',
      entity: 'TicketCampaign',
      entityId: campaignId,
      changes: {
        before: { status: campaign.status },
        after: { status },
      },
    },
  });

  logger.info('Campaign status updated', { campaignId, sellerId, status });

  res.status(200).json({
    success: true,
    message: 'Campaign status updated successfully',
    data: { campaign: updatedCampaign },
  });
};

/**
 * Get campaign analytics
 */
export const getCampaignAnalytics = async (req, res) => {
  const { campaignId } = req.params;

  const analytics = await prisma.campaignAnalytics.findUnique({
    where: { campaignId },
    include: {
      campaign: {
        select: {
          title: true,
          eventType: true,
          totalQuantity: true,
          soldQuantity: true,
          ticketTypes: true,
        },
      },
    },
  });

  if (!analytics) {
    throw new NotFoundError('Campaign analytics');
  }

  // Calculate additional metrics
  const availableQuantity = analytics.campaign.totalQuantity - analytics.campaign.soldQuantity;
  const soldPercentage = (analytics.campaign.soldQuantity / analytics.campaign.totalQuantity) * 100;

  // Get ticket type breakdown
  const ticketTypeBreakdown = {};
  const bookings = await prisma.booking.findMany({
    where: { campaignId, status: 'CONFIRMED' },
    select: { ticketType: true, quantity: true },
  });

  bookings.forEach(booking => {
    if (!ticketTypeBreakdown[booking.ticketType]) {
      ticketTypeBreakdown[booking.ticketType] = 0;
    }
    ticketTypeBreakdown[booking.ticketType] += booking.quantity;
  });

  res.status(200).json({
    success: true,
    data: {
      analytics: {
        ...analytics,
        availableQuantity,
        soldPercentage: soldPercentage.toFixed(2),
        ticketTypeBreakdown,
      },
    },
  });
};

/**
 * Assign managers to campaign
 */
export const assignManagers = async (req, res) => {
  const { campaignId } = req.params;
  const { managerIds } = req.body;
  const sellerId = req.user.id;

  if (!Array.isArray(managerIds) || managerIds.length === 0) {
    throw new ValidationError('Manager IDs must be provided as an array');
  }

  // Get campaign
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  // Verify ownership
  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only assign managers to your own campaigns');
  }

  // Verify all managers belong to the seller
  const managers = await prisma.user.findMany({
    where: {
      id: { in: managerIds },
      role: 'MANAGER',
    },
  });

  if (managers.length !== managerIds.length) {
    throw new ValidationError('Some manager IDs are invalid');
  }

  // Assign managers to campaign
  await prisma.ticketCampaign.update({
    where: { id: campaignId },
    data: {
      managers: {
        connect: managerIds.map(id => ({ id })),
      },
    },
  });

  logger.info('Managers assigned to campaign', { campaignId, sellerId, managerIds });

  res.status(200).json({
    success: true,
    message: 'Managers assigned successfully',
    data: {
      campaignId,
      managerIds,
    },
  });
};

/**
 * Upload campaign cover image
 */
export const uploadCoverImage = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;
  const file = req.file;

  if (!file) {
    throw new ValidationError('No image file provided');
  }

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true, coverImage: true }
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only upload images for your own campaigns');
  }

  try {
    // Upload new image
    const uploadResult = await imageService.uploadCoverImage(file, campaignId);

    // Delete old cover image if exists
    if (campaign.coverImage) {
      try {
        const publicId = campaign.coverImage.match(/\/v\d+\/(.+)\.[a-z]+$/i)?.[1];
        if (publicId) {
          await imageService.deleteImage(publicId);
        }
      } catch (error) {
        logger.warn('Failed to delete old cover image:', error);
      }
    }

    // Update campaign with new cover image
    await prisma.ticketCampaign.update({
      where: { id: campaignId },
      data: { coverImage: uploadResult.url }
    });

    // Clear cache
    await cache.clearPattern(`campaigns:*`);
    await cache.clearPattern(`campaign_search:*`);

    logger.info('Cover image uploaded successfully', { 
      campaignId, 
      sellerId, 
      imageUrl: uploadResult.url 
    });

    res.status(200).json({
      success: true,
      message: 'Cover image uploaded successfully',
      data: {
        imageUrl: uploadResult.url,
        publicId: uploadResult.publicId,
        width: uploadResult.width,
        height: uploadResult.height
      }
    });
  } catch (error) {
    logger.error('Cover image upload failed:', error);
    throw error;
  }
};

/**
 * Upload campaign gallery images
 */
export const uploadGalleryImages = async (req, res) => {
  const { campaignId } = req.params;
  const sellerId = req.user.id;
  const files = req.files;

  if (!files || files.length === 0) {
    throw new ValidationError('No image files provided');
  }

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true, images: true }
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only upload images for your own campaigns');
  }

  try {
    const existingImages = Array.isArray(campaign.images) ? campaign.images : [];
    
    // Upload new images
    const uploadResults = await imageService.uploadGalleryImages(
      files, 
      campaignId, 
      existingImages.length
    );

    // Update campaign with new images
    const newImageUrls = uploadResults.map(result => result.url);
    const allImages = [...existingImages, ...newImageUrls];

    await prisma.ticketCampaign.update({
      where: { id: campaignId },
      data: { images: allImages }
    });

    // Clear cache
    await cache.clearPattern(`campaigns:*`);
    await cache.clearPattern(`campaign_search:*`);

    logger.info('Gallery images uploaded successfully', { 
      campaignId, 
      sellerId, 
      count: uploadResults.length 
    });

    res.status(200).json({
      success: true,
      message: `${uploadResults.length} images uploaded successfully`,
      data: {
        images: uploadResults.map(result => ({
          url: result.url,
          publicId: result.publicId,
          originalName: result.originalName,
          width: result.width,
          height: result.height
        })),
        totalImages: allImages.length
      }
    });
  } catch (error) {
    logger.error('Gallery images upload failed:', error);
    throw error;
  }
};

/**
 * Delete campaign image
 */
export const deleteImage = async (req, res) => {
  const { campaignId, imageType } = req.params;
  const { imageUrl } = req.body;
  const sellerId = req.user.id;

  if (!imageUrl) {
    throw new ValidationError('Image URL is required');
  }

  // Verify campaign ownership
  const campaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { sellerId: true, coverImage: true, images: true }
  });

  if (!campaign) {
    throw new NotFoundError('Campaign');
  }

  if (campaign.sellerId !== sellerId) {
    throw new AuthorizationError('You can only delete images from your own campaigns');
  }

  try {
    // Extract public ID from URL
    const publicId = imageUrl.match(/\/v\d+\/(.+)\.[a-z]+$/i)?.[1];
    if (!publicId) {
      throw new ValidationError('Invalid image URL');
    }

    // Delete from Cloudinary
    await imageService.deleteImage(publicId);

    // Update campaign data
    const updateData = {};
    
    if (imageType === 'cover' && campaign.coverImage === imageUrl) {
      updateData.coverImage = null;
    } else if (imageType === 'gallery' && Array.isArray(campaign.images)) {
      updateData.images = campaign.images.filter(img => img !== imageUrl);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.ticketCampaign.update({
        where: { id: campaignId },
        data: updateData
      });
    }

    // Clear cache
    await cache.clearPattern(`campaigns:*`);
    await cache.clearPattern(`campaign_search:*`);

    logger.info('Image deleted successfully', { campaignId, sellerId, imageUrl });

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    logger.error('Image deletion failed:', error);
    throw error;
  }
};

/**
 * Advanced search campaigns
 */
export const searchCampaigns = async (req, res) => {
  const {
    q: search,
    page = 1,
    limit = 20,
    eventType,
    city,
    priceMin,
    priceMax,
    dateFrom,
    dateTo,
    tags,
    sortBy = 'eventDate',
    sortOrder = 'asc',
    availability
  } = req.query;

  try {
    const filters = {
      search,
      eventType,
      city,
      status: 'ACTIVE',
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
      dateFrom,
      dateTo,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : undefined,
      availability,
      sortBy,
      sortOrder
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await searchService.searchCampaigns(filters, pagination);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Advanced search failed:', error);
    throw error;
  }
};

/**
 * Get featured campaigns
 */
export const getFeaturedCampaigns = async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const campaigns = await searchService.getFeaturedCampaigns(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        campaigns,
        count: campaigns.length
      }
    });
  } catch (error) {
    logger.error('Get featured campaigns failed:', error);
    throw error;
  }
};

/**
 * Get search suggestions
 */
export const getSearchSuggestions = async (req, res) => {
  const { q: query, limit = 10 } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(200).json({
      success: true,
      data: { suggestions: [] }
    });
  }

  try {
    const suggestions = await searchService.getSearchSuggestions(
      query.trim(), 
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: { suggestions }
    });
  } catch (error) {
    logger.error('Get search suggestions failed:', error);
    throw error;
  }
};

/**
 * Get nearby campaigns
 */
export const getNearbyCampaigns = async (req, res) => {
  const { latitude, longitude, radius = 50, limit = 20 } = req.query;

  if (!latitude || !longitude) {
    throw new ValidationError('Latitude and longitude are required');
  }

  try {
    const campaigns = await searchService.getNearbyCampaigns(
      parseFloat(latitude),
      parseFloat(longitude),
      parseInt(radius),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: {
        campaigns,
        count: campaigns.length,
        searchRadius: parseInt(radius)
      }
    });
  } catch (error) {
    logger.error('Get nearby campaigns failed:', error);
    throw error;
  }
};
