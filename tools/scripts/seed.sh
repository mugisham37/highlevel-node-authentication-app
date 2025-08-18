#!/bin/bash

# Database Seeding Script
# Seeds the database with development and test data

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

# Function to seed development data
seed_development() {
    log_info "Seeding development data..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Check if seed script exists
        if [ -f "package.json" ] && grep -q "seed" package.json; then
            pnpm run seed
            log_success "Development data seeded successfully."
        elif [ -f "src/seeds/index.ts" ]; then
            pnpm tsx src/seeds/index.ts
            log_success "Development data seeded successfully."
        else
            log_warning "No seed script found in packages/database"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Function to seed test data
seed_test() {
    log_info "Seeding test data..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Set test environment
        export NODE_ENV=test
        export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fullstack_test"
        
        # Check if test seed script exists
        if [ -f "src/seeds/test.ts" ]; then
            pnpm tsx src/seeds/test.ts
            log_success "Test data seeded successfully."
        elif [ -f "package.json" ] && grep -q "seed:test" package.json; then
            pnpm run seed:test
            log_success "Test data seeded successfully."
        else
            log_warning "No test seed script found"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Function to seed production data (minimal)
seed_production() {
    log_warning "Seeding production data..."
    log_warning "This should only be run on initial production setup!"
    
    read -p "Are you sure you want to seed production data? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Production seeding cancelled."
        return
    fi
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Set production environment
        export NODE_ENV=production
        
        # Check if production seed script exists
        if [ -f "src/seeds/production.ts" ]; then
            pnpm tsx src/seeds/production.ts
            log_success "Production data seeded successfully."
        elif [ -f "package.json" ] && grep -q "seed:production" package.json; then
            pnpm run seed:production
            log_success "Production data seeded successfully."
        else
            log_warning "No production seed script found"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Function to clear all data
clear_data() {
    log_warning "This will delete all data in the database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Data clearing cancelled."
        return
    fi
    
    log_info "Clearing database data..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Check if clear script exists
        if [ -f "src/seeds/clear.ts" ]; then
            pnpm tsx src/seeds/clear.ts
            log_success "Database data cleared successfully."
        else
            log_warning "No clear script found"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Function to create sample users
create_sample_users() {
    log_info "Creating sample users..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Check if sample users script exists
        if [ -f "src/seeds/sample-users.ts" ]; then
            pnpm tsx src/seeds/sample-users.ts
            log_success "Sample users created successfully."
        else
            log_warning "No sample users script found"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Main function
main() {
    case "$1" in
        "dev"|"")
            seed_development
            ;;
        "test")
            seed_test
            ;;
        "production"|"prod")
            seed_production
            ;;
        "clear")
            clear_data
            ;;
        "users")
            create_sample_users
            ;;
        "all")
            seed_development
            create_sample_users
            ;;
        *)
            echo "Usage: $0 {dev|test|production|clear|users|all}"
            echo ""
            echo "Commands:"
            echo "  dev        - Seed development data (default)"
            echo "  test       - Seed test data"
            echo "  production - Seed minimal production data"
            echo "  clear      - Clear all database data"
            echo "  users      - Create sample users"
            echo "  all        - Seed development data and create sample users"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"