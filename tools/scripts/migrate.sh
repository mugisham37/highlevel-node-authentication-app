#!/bin/bash

# Database Migration Script
# Handles both Prisma and Drizzle migrations

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

# Function to run Prisma migrations
run_prisma_migrations() {
    log_info "Running Prisma migrations..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        if [ -f "package.json" ] && grep -q "prisma" package.json; then
            # Generate Prisma client
            pnpm prisma generate
            
            # Run migrations
            if [ "$1" = "reset" ]; then
                log_warning "Resetting database..."
                pnpm prisma migrate reset --force
            elif [ "$1" = "deploy" ]; then
                log_info "Deploying migrations to production..."
                pnpm prisma migrate deploy
            else
                pnpm prisma migrate dev
            fi
            
            log_success "Prisma migrations completed."
        else
            log_warning "Prisma not found in packages/database"
        fi
        
        cd ../..
    else
        log_warning "Database package not found"
    fi
}

# Function to run Drizzle migrations
run_drizzle_migrations() {
    log_info "Running Drizzle migrations..."
    
    if [ -d "packages/database/src/drizzle" ]; then
        cd packages/database
        
        if [ -f "package.json" ] && grep -q "drizzle" package.json; then
            # Generate migrations
            pnpm drizzle-kit generate:pg
            
            # Run migrations
            if [ "$1" = "reset" ]; then
                log_warning "Resetting Drizzle database..."
                pnpm drizzle-kit drop
                pnpm drizzle-kit push:pg
            else
                pnpm drizzle-kit push:pg
            fi
            
            log_success "Drizzle migrations completed."
        else
            log_warning "Drizzle not found in packages/database"
        fi
        
        cd ../..
    else
        log_warning "Drizzle configuration not found"
    fi
}

# Function to create a new migration
create_migration() {
    local migration_name="$1"
    
    if [ -z "$migration_name" ]; then
        log_error "Migration name is required"
        echo "Usage: $0 create <migration_name>"
        exit 1
    fi
    
    log_info "Creating new migration: $migration_name"
    
    # Create Prisma migration
    if [ -d "packages/database" ]; then
        cd packages/database
        pnpm prisma migrate dev --name "$migration_name" --create-only
        cd ../..
    fi
    
    log_success "Migration created: $migration_name"
}

# Function to check migration status
check_status() {
    log_info "Checking migration status..."
    
    if [ -d "packages/database" ]; then
        cd packages/database
        
        # Prisma status
        if [ -f "package.json" ] && grep -q "prisma" package.json; then
            log_info "Prisma migration status:"
            pnpm prisma migrate status
        fi
        
        cd ../..
    fi
}

# Main function
main() {
    case "$1" in
        "dev"|"")
            run_prisma_migrations "dev"
            run_drizzle_migrations "dev"
            ;;
        "reset")
            log_warning "This will reset the database and delete all data!"
            read -p "Are you sure? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                run_prisma_migrations "reset"
                run_drizzle_migrations "reset"
            else
                log_info "Migration reset cancelled."
            fi
            ;;
        "deploy")
            run_prisma_migrations "deploy"
            run_drizzle_migrations "deploy"
            ;;
        "create")
            create_migration "$2"
            ;;
        "status")
            check_status
            ;;
        *)
            echo "Usage: $0 {dev|reset|deploy|create <name>|status}"
            echo ""
            echo "Commands:"
            echo "  dev     - Run development migrations"
            echo "  reset   - Reset database and run all migrations"
            echo "  deploy  - Deploy migrations to production"
            echo "  create  - Create a new migration"
            echo "  status  - Check migration status"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"