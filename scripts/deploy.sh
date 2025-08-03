#!/bin/bash

# Enterprise Auth Backend Deployment Script
# This script handles deployment of the application in different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
BUILD_ONLY=false
SKIP_TESTS=false
SKIP_MIGRATIONS=false
FORCE_REBUILD=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Set environment (development|production) [default: development]"
    echo "  -b, --build-only         Only build images, don't start services"
    echo "  -t, --skip-tests         Skip running tests before deployment"
    echo "  -m, --skip-migrations    Skip database migrations"
    echo "  -f, --force-rebuild      Force rebuild of all images"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production                    # Deploy to production"
    echo "  $0 -e development -f               # Force rebuild in development"
    echo "  $0 -e production -b                # Build production images only"
    echo "  $0 -e development -t -m            # Skip tests and migrations"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -b|--build-only)
            BUILD_ONLY=true
            shift
            ;;
        -t|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -m|--skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        -f|--force-rebuild)
            FORCE_REBUILD=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Must be 'development' or 'production'"
    exit 1
fi

print_status "Starting deployment for environment: $ENVIRONMENT"

# Set Docker Compose file based on environment
if [[ "$ENVIRONMENT" == "production" ]]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    DOCKER_TARGET="runtime"
else
    COMPOSE_FILE="docker-compose.yml"
    DOCKER_TARGET="development"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if required files exist
if [[ ! -f "$COMPOSE_FILE" ]]; then
    print_error "Docker Compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [[ ! -f "Dockerfile" ]]; then
    print_error "Dockerfile not found"
    exit 1
fi

# Load environment variables
if [[ -f ".env" ]]; then
    print_status "Loading environment variables from .env file"
    export $(cat .env | grep -v '^#' | xargs)
elif [[ -f ".env.example" ]]; then
    print_warning ".env file not found, using .env.example"
    export $(cat .env.example | grep -v '^#' | xargs)
else
    print_warning "No environment file found. Using default values."
fi

# Run tests if not skipped
if [[ "$SKIP_TESTS" == false ]]; then
    print_status "Running tests..."
    if npm test; then
        print_success "All tests passed"
    else
        print_error "Tests failed. Deployment aborted."
        exit 1
    fi
fi

# Build Docker images
print_status "Building Docker images..."
BUILD_ARGS=""
if [[ "$FORCE_REBUILD" == true ]]; then
    BUILD_ARGS="--no-cache"
fi

if docker-compose -f "$COMPOSE_FILE" build $BUILD_ARGS; then
    print_success "Docker images built successfully"
else
    print_error "Failed to build Docker images"
    exit 1
fi

# If build-only flag is set, exit here
if [[ "$BUILD_ONLY" == true ]]; then
    print_success "Build completed. Exiting as requested."
    exit 0
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f "$COMPOSE_FILE" down

# Start services
print_status "Starting services..."
if docker-compose -f "$COMPOSE_FILE" up -d; then
    print_success "Services started successfully"
else
    print_error "Failed to start services"
    exit 1
fi

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
print_status "Checking service health..."
RETRIES=30
RETRY_COUNT=0

while [[ $RETRY_COUNT -lt $RETRIES ]]; do
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
        print_success "Services are healthy"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    print_status "Waiting for services to be healthy... ($RETRY_COUNT/$RETRIES)"
    sleep 5
done

if [[ $RETRY_COUNT -eq $RETRIES ]]; then
    print_warning "Some services may not be fully healthy yet"
fi

# Run database migrations if not skipped
if [[ "$SKIP_MIGRATIONS" == false ]]; then
    print_status "Running database migrations..."
    if docker-compose -f "$COMPOSE_FILE" exec -T app npm run db:migrate:up; then
        print_success "Database migrations completed"
    else
        print_warning "Database migrations failed or not needed"
    fi
fi

# Show running services
print_status "Deployment completed. Running services:"
docker-compose -f "$COMPOSE_FILE" ps

# Show service URLs
print_success "Service URLs:"
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "  - Application: http://localhost:3000"
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Grafana: http://localhost:3001 (admin/admin123)"
else
    echo "  - Application: http://localhost:3000"
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Grafana: http://localhost:3001 (admin/admin123)"
    echo "  - Debug Port: 9229"
fi

print_success "Deployment completed successfully!"

# Show logs command
print_status "To view logs, run:"
echo "  docker-compose -f $COMPOSE_FILE logs -f"