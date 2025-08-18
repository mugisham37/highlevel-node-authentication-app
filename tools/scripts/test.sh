#!/bin/bash

# Test Runner Script
# Runs tests for specific packages or all packages

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

# Function to run unit tests
run_unit_tests() {
    local package="$1"
    local watch="$2"
    
    if [ -n "$package" ]; then
        log_info "Running unit tests for $package..."
        if [ "$watch" = "watch" ]; then
            pnpm --filter "$package" run test:watch
        else
            pnpm --filter "$package" run test
        fi
    else
        log_info "Running all unit tests..."
        if [ "$watch" = "watch" ]; then
            pnpm run test:watch
        else
            pnpm run test
        fi
    fi
}

# Function to run integration tests
run_integration_tests() {
    local package="$1"
    
    log_info "Running integration tests..."
    
    # Start test services if needed
    if [ -f "tools/build/docker-compose.yml" ]; then
        log_info "Starting test services..."
        cd tools/build
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d postgres-test redis-test
        else
            docker compose up -d postgres-test redis-test
        fi
        cd ../..
        
        # Wait for services to be ready
        sleep 5
    fi
    
    if [ -n "$package" ]; then
        pnpm --filter "$package" run test:integration
    else
        pnpm run test:integration
    fi
}

# Function to run E2E tests
run_e2e_tests() {
    local app="$1"
    
    log_info "Running E2E tests..."
    
    case "$app" in
        "web")
            log_info "Running web E2E tests with Playwright..."
            pnpm playwright test
            ;;
        "mobile")
            log_info "Running mobile E2E tests with Detox..."
            pnpm detox test
            ;;
        *)
            log_info "Running all E2E tests..."
            pnpm playwright test
            # Mobile tests would be run here if mobile app exists
            ;;
    esac
}

# Function to run tests with coverage
run_coverage() {
    local package="$1"
    
    log_info "Running tests with coverage..."
    
    if [ -n "$package" ]; then
        pnpm --filter "$package" run test:coverage
    else
        pnpm run test:coverage
    fi
    
    log_info "Coverage report generated in coverage/ directory"
}

# Function to list available tests
list_tests() {
    log_info "Discovering available tests..."
    
    # Use Jest to list tests without running them
    pnpm jest --listTests --passWithNoTests
}

# Function to run specific test file
run_test_file() {
    local file="$1"
    
    if [ -z "$file" ]; then
        log_error "Test file path is required"
        exit 1
    fi
    
    log_info "Running test file: $file"
    pnpm jest "$file"
}

# Function to validate test setup
validate_setup() {
    log_info "Validating test setup..."
    
    # Check if Jest is configured
    if [ ! -f "jest.config.js" ]; then
        log_error "Jest configuration not found"
        exit 1
    fi
    
    # List tests to verify discovery works
    log_info "Discovering tests..."
    pnpm jest --listTests --passWithNoTests > /dev/null
    
    if [ $? -eq 0 ]; then
        log_success "Test discovery successful"
    else
        log_error "Test discovery failed"
        exit 1
    fi
    
    # Check if Playwright is configured
    if [ -f "playwright.config.ts" ]; then
        log_success "Playwright configuration found"
    else
        log_warning "Playwright configuration not found"
    fi
    
    # Check if Detox is configured
    if [ -f ".detoxrc.js" ]; then
        log_success "Detox configuration found"
    else
        log_warning "Detox configuration not found"
    fi
    
    log_success "Test setup validation completed"
}

# Main function
main() {
    case "$1" in
        "unit")
            run_unit_tests "$2" "$3"
            ;;
        "integration")
            run_integration_tests "$2"
            ;;
        "e2e")
            run_e2e_tests "$2"
            ;;
        "coverage")
            run_coverage "$2"
            ;;
        "watch")
            run_unit_tests "$2" "watch"
            ;;
        "list")
            list_tests
            ;;
        "file")
            run_test_file "$2"
            ;;
        "validate")
            validate_setup
            ;;
        "")
            run_unit_tests
            ;;
        *)
            echo "Usage: $0 {unit|integration|e2e|coverage|watch|list|file|validate} [package/app] [file]"
            echo ""
            echo "Commands:"
            echo "  unit [package]     - Run unit tests (default)"
            echo "  integration [pkg]  - Run integration tests"
            echo "  e2e [app]         - Run E2E tests (web/mobile)"
            echo "  coverage [package] - Run tests with coverage"
            echo "  watch [package]    - Run tests in watch mode"
            echo "  list              - List all available tests"
            echo "  file <path>       - Run specific test file"
            echo "  validate          - Validate test setup"
            echo ""
            echo "Examples:"
            echo "  $0 unit @company/shared"
            echo "  $0 e2e web"
            echo "  $0 file src/utils/auth.test.ts"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"