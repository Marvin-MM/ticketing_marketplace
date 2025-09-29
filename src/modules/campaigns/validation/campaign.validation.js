import Joi from 'joi';
import prisma from '../../../config/database.js';

/**
 * Campaign creation validation schema
 */
export const createCampaignSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .required()
    .messages({
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title must not exceed 200 characters',
      'any.required': 'Title is required'
    }),

  description: Joi.string()
    .min(10)
    .max(5000)
    .required()
    .messages({
      'string.min': 'Description must be at least 10 characters long',
      'string.max': 'Description must not exceed 5000 characters',
      'any.required': 'Description is required'
    }),

  eventType: Joi.string()
    .valid('bar', 'sports', 'hotel', 'event', 'concert', 'theater', 'conference', 'workshop', 'other')
    .required()
    .messages({
      'any.only': 'Invalid event type',
      'any.required': 'Event type is required'
    }),

  ticketTypes: Joi.object()
    .pattern(
      Joi.string().alphanum().min(1).max(50),
      Joi.object({
        price: Joi.number()
          .min(0)
          .max(10000)
          .precision(2)
          .required()
          .messages({
            'number.min': 'Price cannot be negative',
            'number.max': 'Price cannot exceed $10,000',
            'any.required': 'Price is required for each ticket type'
          }),
        
        quantity: Joi.number()
          .integer()
          .min(1)
          .max(100000)
          .required()
          .messages({
            'number.min': 'Quantity must be at least 1',
            'number.max': 'Quantity cannot exceed 100,000',
            'number.integer': 'Quantity must be a whole number',
            'any.required': 'Quantity is required for each ticket type'
          }),
        
        description: Joi.string()
          .min(3)
          .max(500)
          .required()
          .messages({
            'string.min': 'Description must be at least 3 characters',
            'string.max': 'Description must not exceed 500 characters',
            'any.required': 'Description is required for each ticket type'
          }),
        
        maxPerOrder: Joi.number()
          .integer()
          .min(1)
          .max(100)
          .optional()
          .default(10)
          .messages({
            'number.min': 'Max per order must be at least 1',
            'number.max': 'Max per order cannot exceed 100'
          }),

        benefits: Joi.array()
          .items(Joi.string().max(100))
          .max(10)
          .optional()
          .messages({
            'array.max': 'Maximum 10 benefits allowed per ticket type'
          })
      }).required()
    )
    .min(1)
    .max(20)
    .required()
    .messages({
      'object.min': 'At least one ticket type is required',
      'object.max': 'Maximum 20 ticket types allowed',
      'any.required': 'Ticket types are required'
    }),

  maxPerCustomer: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .messages({
      'number.min': 'Max per customer must be at least 1',
      'number.max': 'Max per customer cannot exceed 100'
    }),

  startDate: Joi.date()
    .min('now')
    .required()
    .messages({
      'date.min': 'Start date must be in the future',
      'any.required': 'Start date is required'
    }),

  endDate: Joi.date()
    .min(Joi.ref('startDate'))
    .required()
    .messages({
      'date.min': 'End date must be after start date',
      'any.required': 'End date is required'
    }),

  eventDate: Joi.date()
    .min(Joi.ref('startDate'))
    .max(Joi.ref('endDate'))
    .required()
    .messages({
      'date.min': 'Event date must be after start date',
      'date.max': 'Event date must be before end date',
      'any.required': 'Event date is required'
    }),

  venue: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'Venue name must be at least 2 characters',
      'string.max': 'Venue name must not exceed 200 characters',
      'any.required': 'Venue is required'
    }),

  venueAddress: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min': 'Venue address must be at least 5 characters',
      'string.max': 'Venue address must not exceed 500 characters',
      'any.required': 'Venue address is required'
    }),

  venueCity: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'City must be at least 2 characters',
      'string.max': 'City must not exceed 100 characters',
      'any.required': 'City is required'
    }),

  venueCountry: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required'
    }),

  coverImage: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .messages({
      'string.uri': 'Cover image must be a valid URL'
    }),

  images: Joi.array()
    .items(
      Joi.string().uri({ scheme: ['http', 'https'] }).messages({
        'string.uri': 'Each image must be a valid URL'
      })
    )
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 images allowed'
    }),

  isMultiScan: Joi.boolean()
    .optional()
    .default(false),

  maxScansPerTicket: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(1)
    .when('isMultiScan', {
      is: true,
      then: Joi.number().min(2).max(100).messages({
        'number.min': 'Multi-scan tickets must allow at least 2 scans'
      })
    })
    .messages({
      'number.min': 'Max scans must be at least 1',
      'number.max': 'Max scans cannot exceed 100'
    }),

  tags: Joi.array()
    .items(
      Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[a-zA-Z0-9\s\-_]+$/)
        .messages({
          'string.pattern.base': 'Tags can only contain letters, numbers, spaces, hyphens, and underscores'
        })
    )
    .max(20)
    .optional()
    .messages({
      'array.max': 'Maximum 20 tags allowed'
    }),

  metadata: Joi.object()
    .max(10)
    .optional()
    .messages({
      'object.max': 'Maximum 10 metadata fields allowed'
    })
}).custom(async (value, helpers) => {
  // Custom async validations
  const sellerId = helpers.state.ancestors[0].user?.id;
  
  if (!sellerId) {
    throw new Error('Seller ID is required');
  }

  // Check seller campaign limits
  const campaignCount = await prisma.ticketCampaign.count({
    where: { sellerId }
  });

  if (campaignCount >= 50) {
    throw new Error('Maximum campaign limit reached (50 campaigns per seller)');
  }

  // Check active campaign limits
  const activeCampaignCount = await prisma.ticketCampaign.count({
    where: { 
      sellerId,
      status: { in: ['ACTIVE', 'DRAFT'] }
    }
  });

  if (activeCampaignCount >= 15) {
    throw new Error('Maximum active campaign limit reached (15 campaigns)');
  }

  // Validate total ticket quantity
  const totalQuantity = Object.values(value.ticketTypes).reduce(
    (sum, ticket) => sum + ticket.quantity, 0
  );

  if (totalQuantity > 100000) {
    throw new Error('Total ticket quantity cannot exceed 100,000');
  }

  // Validate pricing structure
  const prices = Object.values(value.ticketTypes).map(ticket => ticket.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (maxPrice / minPrice > 50 && minPrice > 0) {
    throw new Error('Price difference between ticket types is too large (max 50x difference)');
  }

  return value;
});

/**
 * Campaign update validation schema
 */
export const updateCampaignSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .optional()
    .messages({
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title must not exceed 200 characters'
    }),

  description: Joi.string()
    .min(10)
    .max(5000)
    .optional()
    .messages({
      'string.min': 'Description must be at least 10 characters long',
      'string.max': 'Description must not exceed 5000 characters'
    }),

  ticketTypes: Joi.object()
    .pattern(
      Joi.string().alphanum().min(1).max(50),
      Joi.object({
        price: Joi.number().min(0).max(10000).precision(2).optional(),
        quantity: Joi.number().integer().min(0).max(100000).optional(),
        description: Joi.string().min(3).max(500).optional(),
        maxPerOrder: Joi.number().integer().min(1).max(100).optional(),
        benefits: Joi.array().items(Joi.string().max(100)).max(10).optional()
      })
    )
    .min(1)
    .max(20)
    .optional(),

  maxPerCustomer: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional(),

  endDate: Joi.date()
    .min('now')
    .optional()
    .messages({
      'date.min': 'End date must be in the future'
    }),

  venue: Joi.string().min(2).max(200).optional(),
  venueAddress: Joi.string().min(5).max(500).optional(),
  venueCity: Joi.string().min(2).max(100).optional(),
  venueCountry: Joi.string().min(2).max(100).optional(),

  coverImage: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional(),

  images: Joi.array()
    .items(Joi.string().uri({ scheme: ['http', 'https'] }))
    .max(10)
    .optional(),

  isMultiScan: Joi.boolean().optional(),
  
  maxScansPerTicket: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional(),

  tags: Joi.array()
    .items(
      Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[a-zA-Z0-9\s\-_]+$/)
    )
    .max(20)
    .optional(),

  metadata: Joi.object().max(10).optional()
}).custom(async (value, helpers) => {
  // For updates, validate against existing campaign
  const campaignId = helpers.state.ancestors[0].params?.campaignId;
  
  if (!campaignId) {
    return value;
  }

  const existingCampaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: {
        select: {
          bookings: true,
          tickets: true
        }
      }
    }
  });

  if (!existingCampaign) {
    throw new Error('Campaign not found');
  }

  // Don't allow major changes if there are existing bookings
  if (existingCampaign._count.bookings > 0) {
    const restrictedFields = ['ticketTypes', 'eventDate', 'isMultiScan', 'maxScansPerTicket'];
    const hasRestrictedChanges = restrictedFields.some(field => 
      value[field] !== undefined
    );

    if (hasRestrictedChanges) {
      throw new Error('Cannot modify ticket types or event details when bookings exist');
    }
  }

  // Validate ticket type quantity changes
  if (value.ticketTypes && existingCampaign.soldQuantity > 0) {
    const currentTypes = existingCampaign.ticketTypes;
    
    for (const [typeKey, newType] of Object.entries(value.ticketTypes)) {
      const currentType = currentTypes[typeKey];
      if (currentType && newType.quantity < currentType.quantity) {
        // Check if reducing quantity would affect sold tickets
        const soldForType = await prisma.ticket.count({
          where: {
            campaignId,
            ticketType: typeKey
          }
        });

        if (newType.quantity < soldForType) {
          throw new Error(`Cannot reduce quantity for ${typeKey} tickets below sold amount (${soldForType})`);
        }
      }
    }
  }

  return value;
});

/**
 * Campaign status update validation schema
 */
export const updateCampaignStatusSchema = Joi.object({
  status: Joi.string()
    .valid('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED')
    .required()
    .messages({
      'any.only': 'Invalid campaign status',
      'any.required': 'Status is required'
    })
}).custom(async (value, helpers) => {
  const campaignId = helpers.state.ancestors[0].params?.campaignId;
  const newStatus = value.status;
  
  if (!campaignId) {
    return value;
  }

  const existingCampaign = await prisma.ticketCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true, endDate: true, startDate: true }
  });

  if (!existingCampaign) {
    throw new Error('Campaign not found');
  }

  const currentStatus = existingCampaign.status;
  const now = new Date();

  // Define valid status transitions
  const validTransitions = {
    'DRAFT': ['ACTIVE', 'CANCELLED'],
    'ACTIVE': ['PAUSED', 'ENDED', 'CANCELLED'],
    'PAUSED': ['ACTIVE', 'ENDED', 'CANCELLED'],
    'ENDED': [],
    'CANCELLED': []
  };

  if (!validTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Cannot change status from ${currentStatus} to ${newStatus}`);
  }

  // Additional business rules
  if (newStatus === 'ACTIVE') {
    if (existingCampaign.startDate > now) {
      throw new Error('Cannot activate campaign before start date');
    }
    if (existingCampaign.endDate < now) {
      throw new Error('Cannot activate campaign after end date');
    }
  }

  return value;
});

/**
 * Manager assignment validation schema
 */
export const assignManagersSchema = Joi.object({
  managerIds: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[a-zA-Z0-9_-]+$/)
        .messages({
          'string.pattern.base': 'Invalid manager ID format'
        })
    )
    .min(1)
    .max(50)
    .unique()
    .required()
    .messages({
      'array.min': 'At least one manager ID is required',
      'array.max': 'Maximum 50 managers can be assigned',
      'array.unique': 'Duplicate manager IDs are not allowed',
      'any.required': 'Manager IDs are required'
    })
}).custom(async (value, helpers) => {
  const { managerIds } = value;
  const sellerId = helpers.state.ancestors[0].user?.id;

  if (!sellerId) {
    throw new Error('Seller ID is required');
  }

  // Verify all managers exist and belong to the seller
  const managers = await prisma.manager.findMany({
    where: {
      id: { in: managerIds },
      sellerId,
      isActive: true
    }
  });

  if (managers.length !== managerIds.length) {
    const foundIds = managers.map(m => m.id);
    const notFoundIds = managerIds.filter(id => !foundIds.includes(id));
    throw new Error(`Invalid or inactive manager IDs: ${notFoundIds.join(', ')}`);
  }

  return value;
});

/**
 * Campaign query parameters validation schema
 */
export const campaignQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .optional()
    .default(1)
    .messages({
      'number.min': 'Page must be at least 1',
      'number.max': 'Page cannot exceed 1000'
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    }),

  eventType: Joi.string()
    .valid('bar', 'sports', 'hotel', 'event', 'concert', 'theater', 'conference', 'workshop', 'other')
    .optional(),

  city: Joi.string()
    .min(2)
    .max(100)
    .optional(),

  status: Joi.string()
    .valid('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED')
    .optional()
    .default('ACTIVE'),

  sortBy: Joi.string()
    .valid('eventDate', 'createdAt', 'title', 'totalQuantity', 'soldQuantity', 'updatedAt')
    .optional()
    .default('eventDate'),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .default('asc'),

  search: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Search term must be at least 2 characters',
      'string.max': 'Search term must not exceed 100 characters'
    }),

  priceMin: Joi.number()
    .min(0)
    .max(10000)
    .optional(),

  priceMax: Joi.number()
    .min(Joi.ref('priceMin'))
    .max(10000)
    .optional()
    .messages({
      'number.min': 'Maximum price must be greater than minimum price'
    }),

  dateFrom: Joi.date()
    .optional(),

  dateTo: Joi.date()
    .min(Joi.ref('dateFrom'))
    .optional()
    .messages({
      'date.min': 'End date must be after start date'
    }),

  tags: Joi.array()
    .items(Joi.string().min(1).max(50))
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed in search'
    })
});