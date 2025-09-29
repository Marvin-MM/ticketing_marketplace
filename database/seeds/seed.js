import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import logger from '../../src/config/logger.js';

const prisma = new PrismaClient();

/**
 * Seed the database with initial data
 */
async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');

    // Clear existing data (in development)
    if (process.env.NODE_ENV === 'development') {
      await clearDatabase();
    }

    // Seed categories
    const categories = await seedCategories();
    logger.info(`✅ Seeded ${categories.length} categories`);

    // Seed users
    const { buyers, sellers, admins } = await seedUsers();
    logger.info(`✅ Seeded ${buyers.length} buyers, ${sellers.length} sellers, ${admins.length} admins`);

    // Seed events
    const events = await seedEvents(categories, sellers);
    logger.info(`✅ Seeded ${events.length} events`);

    // Seed tickets
    const tickets = await seedTickets(events);
    logger.info(`✅ Seeded ${tickets.length} tickets`);

    // Seed purchases
    const purchases = await seedPurchases(buyers, tickets);
    logger.info(`✅ Seeded ${purchases.length} purchases`);

    // Seed payment methods for sellers
    await seedPaymentMethods(sellers);
    logger.info('✅ Seeded payment methods for sellers');

    // Seed finance records
    await seedFinanceRecords(sellers);
    logger.info('✅ Seeded finance records for sellers');

    // Seed analytics
    await seedAnalytics(events);
    logger.info('✅ Seeded analytics data');

    logger.info('🎉 Database seeding completed successfully!');
  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Clear existing data (development only)
 */
async function clearDatabase() {
  logger.info('🧹 Clearing existing data...');
  
  await prisma.campaignAnalytics.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.finance.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
}

/**
 * Seed categories
 */
async function seedCategories() {
  const categoryData = [
    {
      name: 'Music',
      description: 'Concerts, festivals, and music events',
      slug: 'music',
      isActive: true,
    },
    {
      name: 'Sports',
      description: 'Football, basketball, and sporting events',
      slug: 'sports',
      isActive: true,
    },
    {
      name: 'Technology',
      description: 'Tech conferences, workshops, and seminars',
      slug: 'technology',
      isActive: true,
    },
    {
      name: 'Arts & Culture',
      description: 'Theater, art exhibitions, cultural events',
      slug: 'arts-culture',
      isActive: true,
    },
    {
      name: 'Business',
      description: 'Business conferences, networking events',
      slug: 'business',
      isActive: true,
    },
    {
      name: 'Food & Drink',
      description: 'Food festivals, wine tastings, culinary events',
      slug: 'food-drink',
      isActive: true,
    },
  ];

  const categories = [];
  for (const data of categoryData) {
    const category = await prisma.category.create({ data });
    categories.push(category);
  }

  return categories;
}

/**
 * Seed users
 */
async function seedUsers() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  // Create admin users
  const adminUsers = [
    {
      email: 'admin@ticketing.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isEmailVerified: true,
      isActive: true,
    },
  ];

  const admins = [];
  for (const userData of adminUsers) {
    const admin = await prisma.user.create({ data: userData });
    admins.push(admin);
  }

  // Create seller users
  const sellerUsers = [];
  for (let i = 0; i < 10; i++) {
    sellerUsers.push({
      email: faker.internet.email(),
      password: hashedPassword,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: 'SELLER',
      isEmailVerified: true,
      isActive: true,
      profile: {
        create: {
          bio: faker.lorem.paragraph(),
          website: faker.internet.url(),
          location: faker.location.city(),
        },
      },
    });
  }

  const sellers = [];
  for (const userData of sellerUsers) {
    const seller = await prisma.user.create({ 
      data: userData,
      include: { profile: true },
    });
    sellers.push(seller);
  }

  // Create buyer users
  const buyerUsers = [];
  for (let i = 0; i < 50; i++) {
    buyerUsers.push({
      email: faker.internet.email(),
      password: hashedPassword,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: 'BUYER',
      isEmailVerified: true,
      isActive: true,
    });
  }

  const buyers = [];
  for (const userData of buyerUsers) {
    const buyer = await prisma.user.create({ data: userData });
    buyers.push(buyer);
  }

  return { buyers, sellers, admins };
}

/**
 * Seed events
 */
async function seedEvents(categories, sellers) {
  const events = [];
  
  for (let i = 0; i < 25; i++) {
    const seller = faker.helpers.arrayElement(sellers);
    const category = faker.helpers.arrayElement(categories);
    const startDate = faker.date.future();
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + faker.number.int({ min: 2, max: 8 }));
    
    const eventData = {
      title: faker.lorem.words(3),
      description: faker.lorem.paragraphs(2),
      startDate,
      endDate,
      venue: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      country: faker.location.country(),
      maxAttendees: faker.number.int({ min: 50, max: 1000 }),
      status: 'PUBLISHED',
      isActive: true,
      sellerId: seller.id,
      categoryId: category.id,
    };

    const event = await prisma.event.create({ data: eventData });
    events.push(event);
  }

  return events;
}

/**
 * Seed tickets
 */
async function seedTickets(events) {
  const tickets = [];
  
  for (const event of events) {
    // Create multiple ticket types for each event
    const ticketTypes = ['General Admission', 'VIP', 'Early Bird', 'Student'];
    const numTypes = faker.number.int({ min: 1, max: 3 });
    
    for (let i = 0; i < numTypes; i++) {
      const ticketData = {
        name: faker.helpers.arrayElement(ticketTypes),
        description: faker.lorem.sentence(),
        price: faker.number.float({ min: 10, max: 500, precision: 0.01 }),
        quantity: faker.number.int({ min: 50, max: 200 }),
        maxPerOrder: faker.number.int({ min: 1, max: 10 }),
        isActive: true,
        eventId: event.id,
      };

      const ticket = await prisma.ticket.create({ data: ticketData });
      tickets.push(ticket);
    }
  }

  return tickets;
}

/**
 * Seed purchases
 */
async function seedPurchases(buyers, tickets) {
  const purchases = [];
  
  // Create purchases for about 20% of tickets
  const numPurchases = Math.floor(tickets.length * 0.2);
  
  for (let i = 0; i < numPurchases; i++) {
    const buyer = faker.helpers.arrayElement(buyers);
    const ticket = faker.helpers.arrayElement(tickets);
    const quantity = faker.number.int({ min: 1, max: Math.min(ticket.maxPerOrder, 5) });
    
    const purchaseData = {
      buyerId: buyer.id,
      ticketId: ticket.id,
      quantity,
      unitPrice: ticket.price,
      totalAmount: ticket.price * quantity,
      status: 'COMPLETED',
      paymentIntentId: `pi_${faker.string.alphanumeric(24)}`,
      transactionId: `txn_${faker.string.alphanumeric(16)}`,
      purchaseDate: faker.date.past(),
      qrCode: faker.string.uuid(),
    };

    const purchase = await prisma.purchase.create({ data: purchaseData });
    purchases.push(purchase);
  }

  return purchases;
}

/**
 * Seed payment methods for sellers
 */
async function seedPaymentMethods(sellers) {
  for (const seller of sellers) {
    // Create a bank account for each seller
    await prisma.paymentMethod.create({
      data: {
        sellerId: seller.id,
        type: 'BANK_ACCOUNT',
        provider: 'FLUTTERWAVE',
        accountName: `${seller.firstName} ${seller.lastName}`,
        accountNumber: faker.finance.accountNumber(10),
        bankCode: faker.helpers.arrayElement(['044', '058', '011', '070', '221']),
        bankName: faker.helpers.arrayElement(['Access Bank', 'GTBank', 'First Bank', 'Fidelity Bank', 'Stanbic IBTC']),
        isDefault: true,
        isActive: true,
      },
    });
  }
}

/**
 * Seed finance records
 */
async function seedFinanceRecords(sellers) {
  for (const seller of sellers) {
    const totalEarnings = faker.number.float({ min: 0, max: 10000, precision: 0.01 });
    const withdrawnAmount = faker.number.float({ min: 0, max: totalEarnings * 0.7, precision: 0.01 });
    const availableBalance = totalEarnings - withdrawnAmount;
    
    await prisma.finance.create({
      data: {
        sellerId: seller.id,
        totalEarnings,
        availableBalance,
        pendingBalance: faker.number.float({ min: 0, max: 1000, precision: 0.01 }),
        withdrawnAmount,
        lastWithdrawalAt: withdrawnAmount > 0 ? faker.date.past() : null,
      },
    });
  }
}

/**
 * Seed analytics data
 */
async function seedAnalytics(events) {
  for (const event of events) {
    const views = faker.number.int({ min: 10, max: 1000 });
    const purchases = faker.number.int({ min: 0, max: Math.floor(views * 0.1) });
    
    await prisma.campaignAnalytics.create({
      data: {
        campaignId: event.id,
        impressions: views,
        clicks: faker.number.int({ min: Math.floor(views * 0.1), max: Math.floor(views * 0.3) }),
        conversions: purchases,
        revenue: purchases * faker.number.float({ min: 10, max: 100, precision: 0.01 }),
        conversionRate: purchases > 0 ? (purchases / views * 100) : 0,
        lastCalculatedAt: new Date(),
      },
    });
  }
}

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      logger.info('✅ Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;