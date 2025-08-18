#!/bin/bash

# Development Environment Setup Script
# This script sets up the complete development environment for the fullstack monolith

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
    
    log_success "All prerequisites are installed."
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    pnpm install
    log_success "Dependencies installed successfully."
}

# Setup environment files
setup_environment() {
    log_info "Setting up environment files..."
    
    # Copy .env.example to .env if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        log_success "Created .env file from .env.example"
    else
        log_warning ".env file already exists, skipping..."
    fi
    
    # Create environment files for each app if they don't exist
    for app in apps/*/; do
        if [ -d "$app" ] && [ -f "$app/.env.example" ] && [ ! -f "$app/.env" ]; then
            cp "$app/.env.example" "$app/.env"
            log_success "Created .env file for $(basename "$app")"
        fi
    done
}

# Start development services
start_services() {
    log_info "Starting development services..."
    
    # Navigate to tools/build directory
    cd tools/build
    
    # Start Docker services
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    # Wait for services to be healthy
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Check if PostgreSQL is ready
    until docker exec fullstack-postgres pg_isready -U postgres; do
        log_info "Waiting for PostgreSQL to be ready..."
        sleep 2
    done
    
    # Check if Redis is ready
    until docker exec fullstack-redis redis-cli ping; do
        log_info "Waiting for Redis to be ready..."
        sleep 2
    done
    
    cd ../..
    log_success "Development services are running."
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Check if Prisma is available
    if [ -d "packages/database" ]; then
        cd packages/database
        if [ -f "package.json" ] && grep -q "prisma" package.json; then
            pnpm prisma migrate dev --name init
            log_success "Prisma migrations completed."
        fi
        cd ../..
    fi
    
    # Check if Drizzle is available
    if [ -d "packages/database/src/drizzle" ]; then
        log_info "Drizzle migrations would be run here (implementation depends on setup)"
    fi
}

# Seed the database
seed_database() {
    log_info "Seeding database..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        if [ -f "package.json" ] && grep -q "seed" package.json; then
            pnpm run seed
            log_success "Database seeded successfully."
        fi
        cd ../..
    fi
}

# Build all packages
build_packages() {
    log_info "Building all packages..."
    pnpm run build
    log_success "All packages built successfully."
}

# Main setup function
main() {
    log_info "Starting development environment setup..."
    
    check_prerequisites
    install_dependencies
    setup_environment
    start_services
    run_migrations
    seed_database
    build_packages
    
    log_success "Development environment setup completed!"
    log_info "You can now start development with: pnpm run dev"
    log_info "Services running:"
    log_info "  - PostgreSQL: localhost:5432"
    log_info "  - Redis: localhost:6379"
    log_info "  - Mailhog UI: http://localhost:8025"
    log_info "  - Test PostgreSQL: localhost:5433"
    log_info "  - Test Redis: localhost:6380"
}

# Run main function
main "$@"