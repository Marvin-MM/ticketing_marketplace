# Deployment Guide

This guide covers deploying the Ticketing Marketplace Backend in various environments.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Docker Deployment](#docker-deployment)
3. [Production Deployment](#production-deployment)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Monitoring & Logging](#monitoring--logging)
7. [Troubleshooting](#troubleshooting)

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- Git

### Local Development

1. **Clone the repository**

```bash
git clone <repository-url>
cd ticketing-marketplace-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your local development values.

4. **Start infrastructure services**

```bash
# Start PostgreSQL, Redis, and RabbitMQ
docker-compose up -d postgres redis rabbitmq
```

5. **Setup database**

```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed database with sample data
npm run seed
```

6. **Start the application**

```bash
# Start API server
npm run dev

# In a separate terminal, start background workers
npm run worker:dev
```

The API will be available at `http://localhost:3001`

## Docker Deployment

### Development with Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Production Docker Deployment

```bash
# Build and start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose exec api npx prisma migrate deploy

# Seed database (optional)
docker-compose exec api npm run seed

# View production logs
docker-compose logs -f api workers
```

## Production Deployment

### Server Requirements

**Minimum Specs:**
- 2 CPU cores
- 4GB RAM
- 50GB storage
- Ubuntu 20.04+ or similar

**Recommended Specs:**
- 4 CPU cores
- 8GB RAM
- 100GB storage
- Load balancer for multiple instances

### Pre-deployment Checklist

1. **Server Preparation**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create app directory
sudo mkdir -p /opt/ticketing-marketplace
cd /opt/ticketing-marketplace
```

2. **Clone Application**

```bash
# Clone repository
git clone <repository-url> .

# Set proper permissions
sudo chown -R $USER:$USER .
```

3. **Environment Configuration**

```bash
# Copy environment template
cp .env.example .env

# Edit with production values
nano .env
```

**Critical Production Variables:**

```env
NODE_ENV=production
JWT_SECRET=your-strong-jwt-secret-256-bits
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_...
FLUTTERWAVE_SECRET_KEY=FLWSECK_...
DATABASE_URL=postgresql://user:pass@localhost:5432/ticketing_marketplace
SMTP_HOST=your-smtp-server.com
SMTP_USER=your-email@domain.com
SMTP_PASS=your-email-password
```

4. **SSL Certificate Setup**

```bash
# Create SSL directory
mkdir -p ssl

# Using Let's Encrypt (recommended)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*.pem
```

5. **Deploy Application**

```bash
# Build and start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose exec api npx prisma migrate deploy

# Verify deployment
docker-compose ps
docker-compose logs -f --tail=50
```

## Environment Configuration

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your-256-bit-secret

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Payments
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_...
FLUTTERWAVE_SECRET_KEY=FLWSECK_...
FLUTTERWAVE_WEBHOOK_HASH=your-webhook-hash
```

### Optional Variables

```env
# AWS S3 (for file uploads)
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-bucket

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Redis
REDIS_PASSWORD=your-redis-password

# RabbitMQ
RABBITMQ_USER=your-rabbitmq-user
RABBITMQ_PASSWORD=your-rabbitmq-password
```

## Database Setup

### Migrations

```bash
# Production migrations
docker-compose exec api npx prisma migrate deploy

# Development migrations
npm run prisma:migrate

# Reset database (development only)
npm run prisma:reset
```

### Backup & Restore

```bash
# Backup database
docker-compose exec postgres pg_dump -U ticketing ticketing_marketplace > backup.sql

# Restore database
docker-compose exec -T postgres psql -U ticketing ticketing_marketplace < backup.sql

# Automated backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec postgres pg_dump -U ticketing ticketing_marketplace > "backup_${DATE}.sql"
find . -name "backup_*.sql" -mtime +7 -delete
EOF

chmod +x backup.sh
```

### Seeding Data

```bash
# Seed production database (optional)
docker-compose exec api npm run seed

# Custom seeding for production
docker-compose exec api node database/seeds/production-seed.js
```

## Monitoring & Logging

### Log Management

```bash
# View application logs
docker-compose logs -f api workers

# Log rotation setup
cat > /etc/logrotate.d/docker-compose << 'EOF'
/opt/ticketing-marketplace/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 644 root root
    postrotate
        docker-compose restart api workers
    endscript
}
EOF
```

### Health Checks

```bash
# Check application health
curl http://localhost:3001/health

# Check all services
docker-compose ps

# Service status script
cat > check-services.sh << 'EOF'
#!/bin/bash
echo "=== Service Status ==="
docker-compose ps

echo -e "\n=== API Health Check ==="
curl -s http://localhost:3001/health | jq .

echo -e "\n=== Database Connection ==="
docker-compose exec postgres pg_isready -U ticketing

echo -e "\n=== Redis Connection ==="
docker-compose exec redis redis-cli ping

echo -e "\n=== RabbitMQ Status ==="
docker-compose exec rabbitmq rabbitmq-diagnostics ping
EOF

chmod +x check-services.sh
```

### Performance Monitoring

```bash
# Monitor resource usage
docker stats

# Database performance
docker-compose exec postgres psql -U ticketing -c "
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
WHERE tablename IN ('users','events','tickets','purchases');"

# Cache hit rates
docker-compose exec redis redis-cli info stats | grep keyspace
```

## Scaling

### Horizontal Scaling

1. **Load Balancer Setup (nginx)**

```nginx
upstream api_servers {
    server api-1:3000 max_fails=3 fail_timeout=30s;
    server api-2:3000 max_fails=3 fail_timeout=30s;
    server api-3:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    location /api/ {
        proxy_pass http://api_servers;
    }
}
```

2. **Multiple API Instances**

```yaml
# docker-compose.scale.yml
services:
  api:
    deploy:
      replicas: 3
  
  workers:
    deploy:
      replicas: 5
```

### Database Scaling

```bash
# Read replicas setup
# Add to docker-compose.yml
postgres-read:
  image: postgres:15-alpine
  environment:
    POSTGRES_MASTER_SERVICE: postgres
    POSTGRES_MASTER_PORT: 5432
  volumes:
    - postgres_read_data:/var/lib/postgresql/data
```

## Security

### Production Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT secrets (256-bit)
- [ ] Enable SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Enable rate limiting
- [ ] Set up fail2ban
- [ ] Regular security updates
- [ ] Backup encryption

### Firewall Configuration

```bash
# UFW firewall setup
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Docker-specific rules
sudo ufw allow from 172.16.0.0/12
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
```bash
# Check database status
docker-compose exec postgres pg_isready

# Check logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

2. **Redis Connection Failed**
```bash
# Check Redis status
docker-compose exec redis redis-cli ping

# Check memory usage
docker-compose exec redis redis-cli info memory

# Clear cache
docker-compose exec redis redis-cli flushall
```

3. **RabbitMQ Issues**
```bash
# Check queue status
docker-compose exec rabbitmq rabbitmq-diagnostics status

# View queue contents
docker-compose exec rabbitmq rabbitmqctl list_queues

# Reset queues
docker-compose exec rabbitmq rabbitmqctl purge_queue email
```

4. **High CPU/Memory Usage**
```bash
# Check resource usage
docker stats --no-stream

# Scale down if needed
docker-compose up -d --scale workers=2
```

5. **Email Delivery Issues**
```bash
# Test email configuration
docker-compose exec api node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({...});
transporter.verify(console.log);
"
```

### Performance Optimization

```bash
# Optimize PostgreSQL
echo "
shared_preload_libraries = 'pg_stat_statements'
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
" >> postgresql.conf

# Optimize Redis
echo "
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
" >> redis.conf
```

### Debugging

```bash
# Enable debug mode
export DEBUG=ticketing:*
docker-compose restart api

# Database query logging
echo "log_statement = 'all'" >> postgresql.conf

# Application profiling
docker-compose exec api node --inspect=0.0.0.0:9229 src/app.js
```

### Rollback Strategy

```bash
# Quick rollback script
cat > rollback.sh << 'EOF'
#!/bin/bash
echo "Rolling back to previous version..."

# Stop current services
docker-compose down

# Switch to previous version
git checkout HEAD~1

# Restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "Rollback completed"
EOF

chmod +x rollback.sh
```

For additional support, please refer to the main README.md or create an issue in the repository.