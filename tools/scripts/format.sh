#!/bin/bash

# Code Formatting and Linting Script
# Handles formatting, linting, and code quality checks

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

# Function to format code with Prettier
format_code() {
    local fix="$1"
    
    log_info "Running Prettier code formatting..."
    
    if [ "$fix" = "fix" ]; then
        pnpm prettier --write "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"
        log_success "Code formatted successfully"
    else
        pnpm prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"
        if [ $? -eq 0 ]; then
            log_success "Code formatting is correct"
        else
            log_error "Code formatting issues found. Run with 'fix' to auto-format"
            return 1
        fi
    fi
}

# Function to lint code with ESLint
lint_code() {
    local fix="$1"
    local package="$2"
    
    log_info "Running ESLint code linting..."
    
    if [ -n "$package" ]; then
        if [ "$fix" = "fix" ]; then
            pnpm --filter "$package" run lint:fix
        else
            pnpm --filter "$package" run lint
        fi
    else
        if [ "$fix" = "fix" ]; then
            pnpm run lint:fix
        else
            pnpm run lint
        fi
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Linting completed successfully"
    else
        log_error "Linting issues found"
        return 1
    fi
}

# Function to check TypeScript types
check_types() {
    local package="$1"
    
    log_info "Running TypeScript type checking..."
    
    if [ -n "$package" ]; then
        pnpm --filter "$package" run type-check
    else
        pnpm run type-check
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Type checking completed successfully"
    else
        log_error "Type checking failed"
        return 1
    fi
}

# Function to run all quality checks
run_all_checks() {
    local fix="$1"
    local package="$2"
    
    log_info "Running all code quality checks..."
    
    # Format code
    format_code "$fix"
    
    # Lint code
    lint_code "$fix" "$package"
    
    # Check types
    check_types "$package"
    
    log_success "All code quality checks completed"
}

# Function to setup pre-commit hooks
setup_hooks() {
    log_info "Setting up pre-commit hooks..."
    
    # Install husky hooks
    pnpm husky install
    
    # Add pre-commit hook
    pnpm husky add .husky/pre-commit "pnpm lint-staged"
    
    # Add commit-msg hook
    pnpm husky add .husky/commit-msg "pnpm commitlint --edit \$1"
    
    log_success "Pre-commit hooks setup completed"
}

# Function to run lint-staged
run_staged() {
    log_info "Running lint-staged on staged files..."
    
    pnpm lint-staged
    
    if [ $? -eq 0 ]; then
        log_success "Lint-staged completed successfully"
    else
        log_error "Lint-staged failed"
        return 1
    fi
}

# Function to check code quality metrics
check_metrics() {
    log_info "Checking code quality metrics..."
    
    # Check for TODO/FIXME comments
    log_info "Checking for TODO/FIXME comments..."
    todo_count=$(grep -r "TODO\|FIXME" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | wc -l)
    log_info "Found $todo_count TODO/FIXME comments"
    
    # Check for console.log statements (excluding test files)
    log_info "Checking for console.log statements..."
    console_count=$(grep -r "console\.log" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude="*.test.*" --exclude="*.spec.*" . | wc -l)
    if [ $console_count -gt 0 ]; then
        log_warning "Found $console_count console.log statements in non-test files"
    else
        log_success "No console.log statements found in production code"
    fi
    
    # Check for large files (>500 lines)
    log_info "Checking for large files..."
    large_files=$(find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | xargs wc -l | awk '$1 > 500 {print $2 " (" $1 " lines)"}' | grep -v total)
    if [ -n "$large_files" ]; then
        log_warning "Large files found:"
        echo "$large_files"
    else
        log_success "No large files found"
    fi
}

# Main function
main() {
    case "$1" in
        "format")
            format_code "$2"
            ;;
        "lint")
            lint_code "$2" "$3"
            ;;
        "types")
            check_types "$2"
            ;;
        "all")
            run_all_checks "$2" "$3"
            ;;
        "hooks")
            setup_hooks
            ;;
        "staged")
            run_staged
            ;;
        "metrics")
            check_metrics
            ;;
        "fix")
            run_all_checks "fix" "$2"
            ;;
        *)
            echo "Usage: $0 {format|lint|types|all|hooks|staged|metrics|fix} [fix] [package]"
            echo ""
            echo "Commands:"
            echo "  format [fix]      - Run Prettier formatting"
            echo "  lint [fix] [pkg]  - Run ESLint linting"
            echo "  types [package]   - Run TypeScript type checking"
            echo "  all [fix] [pkg]   - Run all quality checks"
            echo "  hooks             - Setup pre-commit hooks"
            echo "  staged            - Run lint-staged"
            echo "  metrics           - Check code quality metrics"
            echo "  fix [package]     - Fix all auto-fixable issues"
            echo ""
            echo "Examples:"
            echo "  $0 format fix"
            echo "  $0 lint fix @company/shared"
            echo "  $0 all fix"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"