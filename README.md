# Ticketing Marketplace Backend

A production-ready ticketing marketplace backend built with Node.js, Express, PostgreSQL, Redis, and RabbitMQ. Features modular monolithic architecture with Google OAuth authentication, flexible ticket types, real-time booking indicators, and comprehensive financial management.

## 🏗️ Architecture

- **Modular Monolithic Design**: Self-contained modules for Auth, Campaigns, Bookings, Payments, Validation, and Finance
- **Event-Driven Processing**: RabbitMQ for background tasks (emails, PDFs, payments)
- **Real-time Features**: Socket.io with Redis pub/sub for live booking counters
- **High Concurrency**: Optimistic locking and atomic operations for booking management
- **Secure Authentication**: Google OAuth only (no traditional passwords)

## 🚀 Quick Start

### Prerequisites

- Node.js v22+
- Docker and Docker Compose
- Google OAuth credentials
- Flutterwave payment credentials (for production)

### Local Development Setup

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start infrastructure services:**
```bash
docker-compose up -d postgres redis rabbitmq
```

4. **Run database migrations:**
```bash
npx prisma generate
npx prisma migrate dev
```

5. **Start the application:**
```bash
npm run dev
```

## 📊 Database Schema

The system uses PostgreSQL with Prisma ORM, featuring:
- User management with Google OAuth
- Flexible ticket types using JSONB
- Multi-scan ticket support
- Comprehensive audit logging
- Financial tracking with withdrawal methods

## 🔑 Key Features

### Authentication & Authorization
- **Google OAuth Only**: No password management
- **Role-Based Access**: CUSTOMER, SELLER, MANAGER, SUPER_ADMIN
- **Seller Application System**: Approval workflow for new sellers

### Campaign Management
- **Flexible Ticket Types**: Dynamic categories stored as JSONB
- **Multi-venue Support**: Bars, sports, hotels, events
- **Real-time Availability**: Live booking counters via Redis
- **Analytics Dashboard**: Views, bookings, revenue tracking

### Booking System
- **High-Concurrency Handling**: Atomic operations prevent overselling
- **Flexible Issuance**: Single or separate tickets for groups
- **PDF Generation**: Tickets with embedded QR codes
- **Payment Integration**: Flutterwave payment processing

### Validation System
- **QR Code Scanning**: Encrypted QR data with security keys
- **Multi-Scan Support**: Configure tickets for multiple entries
- **Offline Capable**: Sync validation data when reconnected
- **Manager Authentication**: Separate validation app access

### Financial Management
- **Withdrawal Methods**: Bank accounts, mobile money
- **Earnings Tracking**: Real-time balance calculations
- **Transaction History**: Complete audit trail
- **Analytics Reports**: Revenue and sales insights

## 🛠️ API Endpoints

### Authentication
- `GET /api/v1/auth/google` - Initiate Google OAuth
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/apply-seller` - Submit seller application
- `GET /api/v1/auth/profile` - Get user profile

### Campaigns
- `GET /api/v1/campaigns` - List active campaigns
- `POST /api/v1/campaigns` - Create campaign (Seller)
- `PUT /api/v1/campaigns/:id` - Update campaign
- `GET /api/v1/campaigns/:id/analytics` - Campaign analytics

### Bookings (To be implemented)
- `POST /api/v1/bookings` - Create booking
- `GET /api/v1/bookings/:id` - Get booking details
- `POST /api/v1/bookings/:id/confirm` - Confirm payment

### Payments (To be implemented)
- `POST /api/v1/payments/initialize` - Initialize payment
- `POST /api/v1/payments/webhook` - Flutterwave webhook

### Validation (To be implemented)
- `POST /api/v1/validation/scan` - Validate QR code
- `GET /api/v1/validation/ticket/:id` - Get ticket status

## 🔒 Security Features

- **Rate Limiting**: Different limits for auth, booking, and general endpoints
- **Encryption**: AES-256-GCM for sensitive data
- **Session Management**: Secure cookie-based sessions
- **Audit Logging**: Comprehensive security event tracking
- **Input Validation**: Express-validator for all endpoints

## 🐳 Docker Deployment

### Build and run with Docker:
```bash
# Build image
docker build -t ticketing-backend .

# Run with docker-compose
docker-compose up
```

### Production Configuration:
- Use environment-specific `.env` files
- Enable SSL/TLS termination
- Configure proper CORS origins
- Set up monitoring and logging

## 📈 Monitoring & Logging

- **Winston Logger**: Structured logging with daily rotation
- **Health Checks**: `/health` endpoint for monitoring
- **Performance Tracking**: Request timing and metrics
- **Audit Trails**: User actions and system events

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📝 Environment Variables

Key configuration variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST/PORT`: Redis configuration
- `RABBITMQ_URL`: RabbitMQ connection
- `GOOGLE_CLIENT_ID/SECRET`: OAuth credentials
- `SESSION_SECRET`: Session encryption key
- `FLUTTERWAVE_*`: Payment gateway credentials

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🚧 Implementation Status

✅ **Completed:**
- Project structure and configuration
- Database schema with Prisma
- Authentication module (Google OAuth)
- Campaign management module
- Core utilities and middleware

⏳ **In Progress:**
- Bookings module with ticket generation
- Payment integration with Flutterwave
- QR validation system
- Financial management module
- Background workers for async tasks

## 📞 Support

For issues or questions, please open an issue in the repository.