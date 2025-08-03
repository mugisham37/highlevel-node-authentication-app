# Docker Deployment Guide

This guide covers the Docker containerization and deployment setup for the Enterprise Authentication Backend.

## Overview

The application uses a multi-stage Docker build process with optimized configurations for both development and production environments. The setup includes:

- **Multi-stage Dockerfile** with separate stages for dependencies, building, and runtime
- **Development and Production Docker Compose configurations**
- **Health checks and monitoring** with Prometheus and Grafana
- **Automated deployment scripts** for both Unix and Windows environments
- **Nginx reverse proxy** with SSL termination and security headers
- **Comprehensive logging and monitoring**

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │   Application   │    │   PostgreSQL    │
│   (Port 80/443) │────│   (Port 3000)   │────│   (Port 5432)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │      Redis      │
                       │   (Port 6379)   │
                       └─────────────────┘
                              │
                    ┌─────────────────────────┐
                    │    Monitoring Stack     │
                    │  Prometheus + Grafana   │
                    │   (Ports 9090/3001)    │
                    └─────────────────────────┘
```

## Quick Start

### Development Environment

1. **Clone and setup environment:**

   ```bash
   git clone <repository>
   cd enterprise-auth-backend
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start development environment:**

   ```bash
   # Using the deployment script (recommended)
   ./scripts/deploy.sh -e development

   # Or using Docker Compose directly
   docker-compose up -d
   ```

3. **Access services:**
   - Application: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin123)
   - Prometheus: http://localhost:9090
   - pgAdmin: http://localhost:8080 (admin@example.com/admin123)
   - Redis Commander: http://localhost:8081

### Production Environment

1. **Setup environment variables:**

   ```bash
   cp .env.example .env
   # Configure production values in .env
   ```

2. **Deploy to production:**

   ```bash
   # Using the deployment script (recommended)
   ./scripts/deploy.sh -e production

   # Or using Docker Compose directly
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Access services:**
   - Application: https://localhost (with SSL)
   - Grafana: http://localhost:3001
   - Prometheus: http://localhost:9090

## Docker Images

### Multi-Stage Build Process

The Dockerfile uses a multi-stage build process for optimal image size and security:

1. **Base Stage**: Common dependencies and user setup
2. **Dependencies Stage**: Install all dependencies
3. **Builder Stage**: Compile TypeScript and generate Prisma client
4. **Runtime Stage**: Production-ready image with minimal footprint
5. **Development Stage**: Development image with debugging tools

### Image Optimization Features

- **Alpine Linux base** for minimal image size
- **Non-root user** for security
- **Multi-layer caching** for faster builds
- **Production dependency pruning** to reduce image size
- **Security updates** applied during build
- **Health checks** built into the image

## Configuration Files

### Docker Compose Files

- `docker-compose.yml` - Development environment
- `docker-compose.prod.yml` - Production environment
- `docker-compose.override.yml` - Development overrides (auto-loaded)

### Configuration Directories

```
config/
├── grafana/
│   ├── dashboards/
│   │   ├── dashboard.yml
│   │   └── enterprise-auth-dashboard.json
│   └── datasources/
│       └── prometheus.yml
├── nginx/
│   └── nginx.conf
├── prometheus.yml
└── redis.conf
```

### Scripts

```
scripts/
├── deploy.sh              # Unix deployment script
├── deploy.ps1             # Windows deployment script
├── health-check.sh        # Comprehensive health checks
├── docker-healthcheck.sh  # Docker container health check
└── init-db.sql           # Database initialization
```

## Deployment Scripts

### Unix/Linux/macOS

```bash
# Deploy to development
./scripts/deploy.sh -e development

# Deploy to production with force rebuild
./scripts/deploy.sh -e production -f

# Build only (no deployment)
./scripts/deploy.sh -e production -b

# Skip tests and migrations
./scripts/deploy.sh -e development -t -m
```

### Windows (PowerShell)

```powershell
# Deploy to development
.\scripts\deploy.ps1 -Environment development

# Deploy to production with force rebuild
.\scripts\deploy.ps1 -Environment production -ForceRebuild

# Build only (no deployment)
.\scripts\deploy.ps1 -Environment production -BuildOnly

# Skip tests and migrations
.\scripts\deploy.ps1 -Environment development -SkipTests -SkipMigrations
```

## Health Checks

### Application Health Check

The application includes a built-in health check endpoint at `/health` that verifies:

- Database connectivity
- Redis connectivity
- Application status
- Memory usage
- Disk space

### Docker Health Checks

Each service includes Docker health checks:

- **Application**: HTTP health endpoint check
- **PostgreSQL**: `pg_isready` command
- **Redis**: `redis-cli ping` command
- **Prometheus**: HTTP health endpoint
- **Grafana**: HTTP health endpoint

### Comprehensive Health Check Script

```bash
# Run comprehensive health checks
./scripts/health-check.sh -e production -v

# JSON output for monitoring systems
./scripts/health-check.sh -j
```

## Monitoring and Observability

### Prometheus Metrics

The application exposes metrics at `/metrics` including:

- HTTP request metrics (rate, duration, errors)
- Authentication metrics (login attempts, failures)
- Database connection pool metrics
- Redis cache metrics
- Custom business metrics

### Grafana Dashboards

Pre-configured dashboards include:

- Authentication request rates
- Response time percentiles
- Error rates
- Active sessions
- Database performance
- Cache hit rates

### Log Aggregation

Structured logging with:

- JSON format for machine parsing
- Correlation IDs for request tracing
- Different log levels per environment
- Centralized log collection via Docker volumes

## Security Features

### Container Security

- **Non-root user** execution
- **Read-only filesystem** where possible
- **Security options** (`no-new-privileges`)
- **Resource limits** to prevent DoS
- **Network isolation** with custom bridge networks

### Nginx Security

- **SSL/TLS termination** with modern cipher suites
- **Security headers** (HSTS, CSP, X-Frame-Options)
- **Rate limiting** per endpoint type
- **IP whitelisting** for sensitive endpoints
- **Request size limits**

### Database Security

- **Connection encryption** in transit
- **Strong authentication** (SCRAM-SHA-256)
- **Connection limits** and timeouts
- **Query logging** for audit trails
- **Performance monitoring**

## Performance Optimization

### Application Performance

- **Connection pooling** for database and Redis
- **Multi-layer caching** (L1: memory, L2: Redis)
- **Query optimization** with intelligent caching
- **Compression** for HTTP responses
- **Keep-alive connections**

### Container Performance

- **Resource limits** and reservations
- **CPU and memory optimization**
- **Efficient layer caching**
- **Minimal base images**
- **Optimized startup times**

### Database Performance

- **Optimized PostgreSQL configuration**
- **Connection pooling**
- **Query performance monitoring**
- **Index optimization**
- **Vacuum and analyze automation**

## Scaling and High Availability

### Horizontal Scaling

- **Stateless application design**
- **External session storage** (Redis)
- **Load balancer ready** (Nginx)
- **Database read replicas** support
- **Auto-scaling configuration**

### High Availability

- **Health checks** and automatic restarts
- **Graceful shutdown** handling
- **Circuit breaker** patterns
- **Failover mechanisms**
- **Backup and recovery** procedures

## Troubleshooting

### Common Issues

1. **Container won't start**

   ```bash
   # Check logs
   docker-compose logs app

   # Check health status
   docker-compose ps
   ```

2. **Database connection issues**

   ```bash
   # Test database connectivity
   docker-compose exec postgres pg_isready -U auth_user

   # Check database logs
   docker-compose logs postgres
   ```

3. **Redis connection issues**

   ```bash
   # Test Redis connectivity
   docker-compose exec redis redis-cli ping

   # Check Redis logs
   docker-compose logs redis
   ```

4. **Performance issues**

   ```bash
   # Check resource usage
   docker stats

   # Run health checks
   ./scripts/health-check.sh -v
   ```

### Debug Mode

Enable debug mode in development:

```bash
# Set debug environment variables
export DEBUG=*
export LOG_LEVEL=debug

# Restart with debug
docker-compose restart app
```

### Log Analysis

```bash
# Follow all logs
docker-compose logs -f

# Follow specific service logs
docker-compose logs -f app

# Search logs for errors
docker-compose logs app | grep ERROR
```

## Maintenance

### Updates and Patches

1. **Update base images:**

   ```bash
   docker-compose pull
   ./scripts/deploy.sh -e production -f
   ```

2. **Update application:**

   ```bash
   git pull
   ./scripts/deploy.sh -e production
   ```

3. **Database migrations:**
   ```bash
   docker-compose exec app npm run db:migrate:up
   ```

### Backup Procedures

1. **Database backup:**

   ```bash
   docker-compose exec postgres pg_dump -U auth_user enterprise_auth > backup.sql
   ```

2. **Redis backup:**

   ```bash
   docker-compose exec redis redis-cli BGSAVE
   ```

3. **Volume backup:**
   ```bash
   docker run --rm -v enterprise-auth-postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
   ```

### Monitoring and Alerts

Set up monitoring alerts for:

- High error rates (>5%)
- Slow response times (>1s)
- High memory usage (>80%)
- Database connection issues
- Redis connectivity problems
- Disk space usage (>90%)

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis
REDIS_URL=redis://host:port
REDIS_HOST=host
REDIS_PORT=port

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info
NODE_ENV=production

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true

# Performance
NODE_OPTIONS=--max-old-space-size=1024
```

## Support and Contributing

For issues, questions, or contributions:

1. Check the troubleshooting section
2. Review the logs for error messages
3. Run health checks to identify issues
4. Create an issue with detailed information

## License

This deployment configuration is part of the Enterprise Authentication Backend project.
