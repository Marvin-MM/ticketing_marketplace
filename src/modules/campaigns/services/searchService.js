import prisma from '../../../config/database.js';
import { cache } from '../../../config/redis.js';
import logger from '../../../config/logger.js';

/**
 * Build search query with advanced filters
 */
const buildSearchQuery = (filters = {}) => {
  const {
    search,
    eventType,
    city,
    status = 'ACTIVE',
    priceMin,
    priceMax,
    dateFrom,
    dateTo,
    tags,
    sellerId,
    availability
  } = filters;

  const where = {
    AND: []
  };

  // Basic filters
  if (status) {
    where.AND.push({ status });
  }

  if (eventType) {
    where.AND.push({ eventType });
  }

  if (city) {
    where.AND.push({
      venueCity: {
        contains: city,
        mode: 'insensitive'
      }
    });
  }

  if (sellerId) {
    where.AND.push({ sellerId });
  }

  // Text search across multiple fields
  if (search && search.trim()) {
    const searchTerm = search.trim();
    where.AND.push({
      OR: [
        {
          title: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          description: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          venue: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          venueCity: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          tags: {
            has: searchTerm
          }
        }
      ]
    });
  }

  // Date range filtering
  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) {
      dateFilter.gte = new Date(dateFrom);
    }
    if (dateTo) {
      dateFilter.lte = new Date(dateTo);
    }
    where.AND.push({
      eventDate: dateFilter
    });
  }

  // Price range filtering (requires custom query for JSONB)
  if (priceMin !== undefined || priceMax !== undefined) {
    // This will be handled in the raw query section
    where._priceFilter = { priceMin, priceMax };
  }

  // Tags filtering
  if (tags && Array.isArray(tags) && tags.length > 0) {
    where.AND.push({
      tags: {
        hasEvery: tags
      }
    });
  }

  // Availability filtering
  if (availability === 'available') {
    where.AND.push({
      soldQuantity: {
        lt: prisma.ticketCampaign.fields.totalQuantity
      }
    });
  }

  // Ensure campaigns haven't ended
  if (status === 'ACTIVE') {
    where.AND.push({
      endDate: {
        gte: new Date()
      }
    });
  }

  return where;
};

/**
 * Build sort options
 */
const buildSortOptions = (sortBy = 'eventDate', sortOrder = 'asc') => {
  const validSortFields = {
    'eventDate': 'eventDate',
    'createdAt': 'createdAt',
    'updatedAt': 'updatedAt',
    'title': 'title',
    'totalQuantity': 'totalQuantity',
    'soldQuantity': 'soldQuantity',
    'popularity': 'soldQuantity', // alias for soldQuantity
    'price': 'ticketTypes' // special handling needed
  };

  const field = validSortFields[sortBy] || 'eventDate';
  const order = sortOrder === 'desc' ? 'desc' : 'asc';

  if (sortBy === 'price') {
    // Custom sorting by minimum price will be handled in raw query
    return { _priceSort: order };
  }

  return { [field]: order };
};

/**
 * Search campaigns with advanced filtering
 */
export const searchCampaigns = async (filters = {}, pagination = {}) => {
  const {
    page = 1,
    limit = 20
  } = pagination;

  const skip = (page - 1) * limit;
  const take = Math.min(limit, 100); // Limit to 100 results per page

  // Build cache key
  const cacheKey = `campaign_search:${JSON.stringify({ filters, page, limit })}`;
  
  // Check cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const where = buildSearchQuery(filters);
    const orderBy = buildSortOptions(filters.sortBy, filters.sortOrder);

    // Handle price filtering with raw query if needed
    if (where._priceFilter || orderBy._priceSort) {
      return await searchWithPriceFilter(where, orderBy, skip, take, cacheKey);
    }

    // Remove custom filters from where clause
    delete where._priceFilter;

    // Standard Prisma query
    const [campaigns, totalCount] = await Promise.all([
      prisma.ticketCampaign.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              sellerApplication: {
                select: {
                  businessName: true,
                }
              }
            }
          },
          analytics: {
            select: {
              totalViews: true,
              totalBookings: true,
              conversionRate: true
            }
          },
          _count: {
            select: {
              bookings: {
                where: { status: 'CONFIRMED' }
              },
              tickets: true
            }
          }
        }
      }),
      prisma.ticketCampaign.count({ where })
    ]);

    // Format campaigns with calculated fields
    const formattedCampaigns = campaigns.map(campaign => ({
      ...campaign,
      availableQuantity: campaign.totalQuantity - campaign.soldQuantity,
      minPrice: getMinPrice(campaign.ticketTypes),
      maxPrice: getMaxPrice(campaign.ticketTypes),
      isPopular: campaign.analytics?.totalViews > 100,
      isTrending: campaign.analytics?.conversionRate > 5,
      bookingsCount: campaign._count.bookings,
      ticketsCount: campaign._count.tickets
    }));

    const result = {
      campaigns: formattedCampaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      },
      filters: {
        applied: Object.keys(filters).filter(key => filters[key] !== undefined && filters[key] !== ''),
        available: await getAvailableFilters()
      }
    };

    // Cache results for 5 minutes
    await cache.set(cacheKey, JSON.stringify(result), 300);

    return result;
  } catch (error) {
    logger.error('Campaign search failed:', { filters, error: error.message });
    throw error;
  }
};

/**
 * Search with price filtering using raw query
 */
const searchWithPriceFilter = async (where, orderBy, skip, take, cacheKey) => {
  const { _priceFilter } = where;
  const { _priceSort } = orderBy;
  
  // Build base query conditions
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Add basic conditions
  if (where.AND) {
    for (const condition of where.AND) {
      if (condition.status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(condition.status);
        paramIndex++;
      }
      if (condition.eventType) {
        conditions.push(`"eventType" = $${paramIndex}`);
        params.push(condition.eventType);
        paramIndex++;
      }
      if (condition.venueCity?.contains) {
        conditions.push(`LOWER("venueCity") LIKE LOWER($${paramIndex})`);
        params.push(`%${condition.venueCity.contains}%`);
        paramIndex++;
      }
      if (condition.eventDate?.gte) {
        conditions.push(`"eventDate" >= $${paramIndex}`);
        params.push(condition.eventDate.gte);
        paramIndex++;
      }
      if (condition.eventDate?.lte) {
        conditions.push(`"eventDate" <= $${paramIndex}`);
        params.push(condition.eventDate.lte);
        paramIndex++;
      }
      if (condition.endDate?.gte) {
        conditions.push(`"endDate" >= $${paramIndex}`);
        params.push(condition.endDate.gte);
        paramIndex++;
      }
    }
  }

  // Add price filtering
  if (_priceFilter?.priceMin !== undefined) {
    conditions.push(`(
      SELECT MIN((value->>'price')::numeric) 
      FROM jsonb_each("ticketTypes")
    ) >= $${paramIndex}`);
    params.push(_priceFilter.priceMin);
    paramIndex++;
  }

  if (_priceFilter?.priceMax !== undefined) {
    conditions.push(`(
      SELECT MAX((value->>'price')::numeric) 
      FROM jsonb_each("ticketTypes")
    ) <= $${paramIndex}`);
    params.push(_priceFilter.priceMax);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build order clause
  let orderClause = '';
  if (_priceSort) {
    orderClause = `ORDER BY (
      SELECT MIN((value->>'price')::numeric) 
      FROM jsonb_each("ticketTypes")
    ) ${_priceSort === 'desc' ? 'DESC' : 'ASC'}`;
  } else {
    orderClause = `ORDER BY "eventDate" ASC`;
  }

  // Execute raw query
  const campaignsQuery = `
    SELECT 
      *,
      (
        SELECT MIN((value->>'price')::numeric) 
        FROM jsonb_each("ticketTypes")
      ) as min_price,
      (
        SELECT MAX((value->>'price')::numeric) 
        FROM jsonb_each("ticketTypes")
      ) as max_price
    FROM "ticket_campaigns"
    ${whereClause}
    ${orderClause}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(take, skip);

  const countQuery = `
    SELECT COUNT(*) as count
    FROM "ticket_campaigns"
    ${whereClause}
  `;

  const [campaignsResult, countResult] = await Promise.all([
    prisma.$queryRawUnsafe(campaignsQuery, ...params),
    prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)) // Remove limit/offset params
  ]);

  const totalCount = parseInt(countResult[0].count);

  // Format results
  const campaigns = campaignsResult.map(campaign => ({
    ...campaign,
    availableQuantity: campaign.totalQuantity - campaign.soldQuantity,
    minPrice: parseFloat(campaign.min_price),
    maxPrice: parseFloat(campaign.max_price)
  }));

  const result = {
    campaigns,
    pagination: {
      page: Math.floor(skip / take) + 1,
      limit: take,
      total: totalCount,
      pages: Math.ceil(totalCount / take),
      hasNext: skip + take < totalCount,
      hasPrev: skip > 0
    }
  };

  // Cache results
  await cache.set(cacheKey, JSON.stringify(result), 300);

  return result;
};

/**
 * Get featured campaigns
 */
export const getFeaturedCampaigns = async (limit = 10) => {
  const cacheKey = `featured_campaigns:${limit}`;
  
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const campaigns = await prisma.ticketCampaign.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      take: limit,
      orderBy: [
        { soldQuantity: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sellerApplication: {
              select: { businessName: true }
            }
          }
        },
        analytics: {
          select: {
            totalViews: true,
            totalBookings: true,
            conversionRate: true
          }
        }
      }
    });

    const formattedCampaigns = campaigns.map(campaign => ({
      ...campaign,
      availableQuantity: campaign.totalQuantity - campaign.soldQuantity,
      minPrice: getMinPrice(campaign.ticketTypes),
      maxPrice: getMaxPrice(campaign.ticketTypes)
    }));

    // Cache for 15 minutes
    await cache.set(cacheKey, JSON.stringify(formattedCampaigns), 900);

    return formattedCampaigns;
  } catch (error) {
    logger.error('Featured campaigns query failed:', error);
    throw error;
  }
};

/**
 * Get nearby campaigns based on location
 */
export const getNearbyCampaigns = async (latitude, longitude, radiusKm = 50, limit = 20) => {
  // This is a simplified version - in production, you'd use PostGIS or similar
  // For now, we'll do a basic city-based search
  
  try {
    const campaigns = await prisma.ticketCampaign.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      take: limit,
      orderBy: { eventDate: 'asc' },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sellerApplication: {
              select: { businessName: true }
            }
          }
        }
      }
    });

    return campaigns.map(campaign => ({
      ...campaign,
      availableQuantity: campaign.totalQuantity - campaign.soldQuantity,
      minPrice: getMinPrice(campaign.ticketTypes),
      maxPrice: getMaxPrice(campaign.ticketTypes),
      distance: null // Would calculate actual distance in production
    }));
  } catch (error) {
    logger.error('Nearby campaigns query failed:', error);
    throw error;
  }
};

/**
 * Get search suggestions
 */
export const getSearchSuggestions = async (query, limit = 10) => {
  if (!query || query.length < 2) {
    return [];
  }

  const cacheKey = `search_suggestions:${query.toLowerCase()}:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const suggestions = await prisma.$queryRaw`
      SELECT DISTINCT
        CASE 
          WHEN title ILIKE ${`%${query}%`} THEN title
          WHEN venue ILIKE ${`%${query}%`} THEN venue
          WHEN "venueCity" ILIKE ${`%${query}%`} THEN "venueCity"
        END as suggestion,
        CASE 
          WHEN title ILIKE ${`%${query}%`} THEN 'title'
          WHEN venue ILIKE ${`%${query}%`} THEN 'venue'
          WHEN "venueCity" ILIKE ${`%${query}%`} THEN 'city'
        END as type
      FROM "ticket_campaigns"
      WHERE status = 'ACTIVE'
        AND "endDate" >= NOW()
        AND (
          title ILIKE ${`%${query}%`}
          OR venue ILIKE ${`%${query}%`}
          OR "venueCity" ILIKE ${`%${query}%`}
        )
      LIMIT ${limit}
    `;

    const formattedSuggestions = suggestions
      .filter(s => s.suggestion)
      .map(s => ({
        text: s.suggestion,
        type: s.type
      }));

    // Cache for 1 hour
    await cache.set(cacheKey, JSON.stringify(formattedSuggestions), 3600);

    return formattedSuggestions;
  } catch (error) {
    logger.error('Search suggestions query failed:', error);
    return [];
  }
};

/**
 * Get available filters for campaigns
 */
const getAvailableFilters = async () => {
  const cacheKey = 'campaign_filters';
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const [eventTypes, cities, priceRange] = await Promise.all([
      prisma.ticketCampaign.findMany({
        where: { status: 'ACTIVE', endDate: { gte: new Date() } },
        select: { eventType: true },
        distinct: ['eventType']
      }),
      prisma.ticketCampaign.findMany({
        where: { status: 'ACTIVE', endDate: { gte: new Date() } },
        select: { venueCity: true },
        distinct: ['venueCity']
      }),
      prisma.$queryRaw`
        SELECT 
          MIN((value->>'price')::numeric) as min_price,
          MAX((value->>'price')::numeric) as max_price
        FROM "ticket_campaigns", 
        jsonb_each("ticketTypes")
        WHERE status = 'ACTIVE' 
        AND "endDate" >= NOW()
      `
    ]);

    const filters = {
      eventTypes: eventTypes.map(c => c.eventType).sort(),
      cities: cities.map(c => c.venueCity).sort(),
      priceRange: {
        min: parseFloat(priceRange[0]?.min_price) || 0,
        max: parseFloat(priceRange[0]?.max_price) || 1000
      }
    };

    // Cache for 1 hour
    await cache.set(cacheKey, JSON.stringify(filters), 3600);

    return filters;
  } catch (error) {
    logger.error('Failed to get available filters:', error);
    return {
      eventTypes: [],
      cities: [],
      priceRange: { min: 0, max: 1000 }
    };
  }
};

/**
 * Helper function to get minimum price from ticket types
 */
const getMinPrice = (ticketTypes) => {
  if (!ticketTypes || typeof ticketTypes !== 'object') {
    return 0;
  }
  const prices = Object.values(ticketTypes).map(ticket => ticket.price);
  return Math.min(...prices);
};

/**
 * Helper function to get maximum price from ticket types
 */
const getMaxPrice = (ticketTypes) => {
  if (!ticketTypes || typeof ticketTypes !== 'object') {
    return 0;
  }
  const prices = Object.values(ticketTypes).map(ticket => ticket.price);
  return Math.max(...prices);
};

const searchService = {
  searchCampaigns,
  getFeaturedCampaigns,
  getNearbyCampaigns,
  getSearchSuggestions,
  getAvailableFilters
};

export default searchService;