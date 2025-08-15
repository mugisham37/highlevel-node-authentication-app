#!/bin/bash

# Enterprise Authentication Backend - Backup System Deployment Script
# This script deploys the backup and disaster recovery system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
ENVIRONMENT="${NODE_ENV:-production}"
ENABLE_REPLICATION="${ENABLE_REPLICATION:-false}"
ENABLE_MONITORING="${ENABLE_MONITORING:-true}"

echo -e "${BLUE}🚀 Deploying Enterprise Auth Backup System${NC}"
echo "Environment: $ENVIRONMENT"
echo "Backup Directory: $BACKUP_DIR"
echo "Cross-Region Replication: $ENABLE_REPLICATION"
echo "Monitoring: $ENABLE_MONITORING"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_status "Docker is installed"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_status "Docker Compose is installed"

# Check if Node.js is installed (for CLI tools)
if ! command -v node &> /dev/null; then
    print_warning "Node.js is not installed. CLI tools may not work."
else
    print_status "Node.js is installed"
fi

# Check if PostgreSQL client tools are available
if ! command -v pg_dump &> /dev/null; then
    print_warning "PostgreSQL client tools (pg_dump) not found. Database backups may fail."
else
    print_status "PostgreSQL client tools are available"
fi

echo ""

# Create backup directory
echo -e "${BLUE}📁 Setting up backup directory...${NC}"
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/postgres"
mkdir -p "$BACKUP_DIR/redis"
mkdir -p "$BACKUP_DIR/manifests"
print_status "Backup directories created"

# Set proper permissions
chmod 755 "$BACKUP_DIR"
chmod 755 "$BACKUP_DIR/postgres"
chmod 755 "$BACKUP_DIR/redis"
chmod 755 "$BACKUP_DIR/manifests"
print_status "Backup directory permissions set"

echo ""

# Validate configuration
echo -e "${BLUE}🔧 Validating configuration...${NC}"

# Check if main application is running
if ! docker-compose ps | grep -q "enterprise-auth-backend"; then
    print_warning "Main application is not running. Starting it first..."
    docker-compose up -d app postgres redis
    sleep 10
fi

# Validate backup configuration
if command -v npm &> /dev/null; then
    npm run backup:cli config validate
    print_status "Backup configuration is valid"
else
    print_warning "Cannot validate configuration - npm not available"
fi

echo ""

# Deploy backup services
echo -e "${BLUE}🚀 Deploying backup services...${NC}"

# Build backup service image
docker-compose -f docker-compose.backup.yml build
print_status "Backup service image built"

# Start core backup services
docker-compose -f docker-compose.backup.yml up -d backup-scheduler
print_status "Backup scheduler started"

if [ "$ENABLE_MONITORING" = "true" ]; then
    docker-compose -f docker-compose.backup.yml up -d backup-monitor
    print_status "Backup monitoring started"
fi

# Start replication service if enabled
if [ "$ENABLE_REPLICATION" = "true" ]; then
    docker-compose -f docker-compose.backup.yml --profile replication up -d backup-replication
    print_status "Cross-region replication started"
fi

echo ""

# Perform initial backup
echo -e "${BLUE}💾 Performing initial backup...${NC}"

# Wait for services to be ready
sleep 5

# Create initial full backup
if command -v npm &> /dev/null; then
    npm run backup:cli backup full
    print_status "Initial full backup completed"
else
    docker-compose -f docker-compose.backup.yml run --rm backup-service npm run backup:cli backup full
    print_status "Initial full backup completed (via Docker)"
fi

echo ""

# Test backup system
echo -e "${BLUE}🧪 Testing backup system...${NC}"

if command -v npm &> /dev/null; then
    if npm run backup:cli backup test; then
        print_status "Backup system test passed"
    else
        print_error "Backup system test failed"
        exit 1
    fi
else
    if docker-compose -f docker-compose.backup.yml run --rm backup-service npm run backup:cli backup test; then
        print_status "Backup system test passed"
    else
        print_error "Backup system test failed"
        exit 1
    fi
fi

echo ""

# Setup monitoring and alerting
echo -e "${BLUE}📊 Setting up monitoring...${NC}"

# Create monitoring configuration
cat > monitoring/backup-alerts.yml << EOF
groups:
  - name: backup-alerts
    rules:
      - alert: BackupFailed
        expr: backup_last_success_timestamp < (time() - 86400)
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Backup has not succeeded in the last 24 hours"
          description: "The backup system has not completed a successful backup in the last 24 hours."

      - alert: BackupStorageFull
        expr: backup_storage_usage_percent > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Backup storage is nearly full"
          description: "Backup storage usage is above 90%. Consider cleaning up old backups or increasing storage capacity."

      - alert: ReplicationLagHigh
        expr: backup_replication_lag_seconds > 3600
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Cross-region replication lag is high"
          description: "Cross-region replication lag is above 1 hour."
EOF

print_status "Monitoring alerts configured"

echo ""

# Create maintenance scripts
echo -e "${BLUE}🔧 Creating maintenance scripts...${NC}"

# Create backup maintenance script
cat > scripts/backup-maintenance.sh << 'EOF'
#!/bin/bash

# Backup maintenance script
# Run this script regularly to maintain the backup system

echo "Starting backup maintenance..."

# Clean up old backups
echo "Cleaning up old backups..."
npm run backup:cli backup cleanup

# Test backup system
echo "Testing backup system..."
npm run backup:cli backup test

# Check replication status
echo "Checking replication status..."
npm run backup:cli replication status

# Generate backup report
echo "Generating backup report..."
npm run backup:cli backup list > /tmp/backup-report.txt
echo "Backup report saved to /tmp/backup-report.txt"

echo "Backup maintenance completed."
EOF

chmod +x scripts/backup-maintenance.sh
print_status "Backup maintenance script created"

# Create disaster recovery test script
cat > scripts/test-disaster-recovery.sh << 'EOF'
#!/bin/bash

# Disaster recovery test script
# Run this script to test disaster recovery procedures

echo "Starting disaster recovery test..."

# Test recovery plans
echo "Testing recovery plans..."
npm run backup:cli dr test

# List available recovery plans
echo "Available recovery plans:"
npm run backup:cli dr list-plans

echo "Disaster recovery test completed."
EOF

chmod +x scripts/test-disaster-recovery.sh
print_status "Disaster recovery test script created"

echo ""

# Display deployment summary
echo -e "${GREEN}🎉 Backup System Deployment Complete!${NC}"
echo ""
echo "Services deployed:"
echo "  ✓ Backup Scheduler (runs every 6 hours)"
if [ "$ENABLE_MONITORING" = "true" ]; then
    echo "  ✓ Backup Monitor (health checks every 30 minutes)"
fi
if [ "$ENABLE_REPLICATION" = "true" ]; then
    echo "  ✓ Cross-Region Replication (syncs every 5 minutes)"
fi
echo ""
echo "Backup directory: $BACKUP_DIR"
echo "Initial backup: Completed"
echo "System test: Passed"
echo ""
echo "Available commands:"
echo "  npm run backup:full          - Create full backup"
echo "  npm run backup:incremental   - Create incremental backup"
echo "  npm run backup:list          - List available backups"
echo "  npm run backup:cleanup       - Clean up old backups"
echo "  npm run backup:test          - Test backup system"
echo ""
echo "Maintenance scripts:"
echo "  ./scripts/backup-maintenance.sh      - Regular maintenance"
echo "  ./scripts/test-disaster-recovery.sh  - Test DR procedures"
echo ""
echo "Monitoring:"
echo "  Backup metrics: http://localhost:9091/metrics"
echo "  Grafana dashboard: http://localhost:3001"
echo "  Prometheus: http://localhost:9090"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review backup configuration in .env file"
echo "2. Set up remote storage credentials (if using cloud storage)"
echo "3. Configure monitoring alerts"
echo "4. Schedule regular disaster recovery tests"
echo "5. Document recovery procedures for your team"
echo ""
echo -e "${GREEN}Backup system is now operational! 🚀${NC}"