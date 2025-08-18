#!/bin/bash

# Security Scanning and Dependency Management Script
# Handles security scanning, dependency updates, and vulnerability checks

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

# Function to audit dependencies for vulnerabilities
audit_dependencies() {
    log_info "Auditing dependencies for security vulnerabilities..."
    
    # Run pnpm audit
    pnpm audit --audit-level moderate
    
    if [ $? -eq 0 ]; then
        log_success "No security vulnerabilities found"
    else
        log_warning "Security vulnerabilities found. Review the output above."
        
        # Attempt to fix automatically
        log_info "Attempting to fix vulnerabilities automatically..."
        pnpm audit --fix
        
        if [ $? -eq 0 ]; then
            log_success "Vulnerabilities fixed automatically"
        else
            log_error "Some vulnerabilities require manual intervention"
        fi
    fi
}

# Function to check for outdated dependencies
check_outdated() {
    log_info "Checking for outdated dependencies..."
    
    pnpm outdated
    
    log_info "Review the output above for outdated packages"
}

# Function to update dependencies
update_dependencies() {
    local type="$1"
    
    case "$type" in
        "patch")
            log_info "Updating patch versions..."
            pnpm update --latest
            ;;
        "minor")
            log_info "Updating minor versions..."
            pnpm update --latest
            ;;
        "major")
            log_warning "Updating major versions (use with caution)..."
            read -p "Are you sure you want to update major versions? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                pnpm update --latest
            else
                log_info "Major version update cancelled"
                return
            fi
            ;;
        *)
            log_info "Updating all dependencies to latest compatible versions..."
            pnpm update
            ;;
    esac
    
    log_success "Dependencies updated"
}

# Function to scan for secrets in code
scan_secrets() {
    log_info "Scanning for potential secrets in code..."
    
    # Check for common secret patterns
    secret_patterns=(
        "password\s*=\s*['\"][^'\"]*['\"]"
        "api[_-]?key\s*=\s*['\"][^'\"]*['\"]"
        "secret\s*=\s*['\"][^'\"]*['\"]"
        "token\s*=\s*['\"][^'\"]*['\"]"
        "private[_-]?key"
        "-----BEGIN.*PRIVATE KEY-----"
    )
    
    found_secrets=false
    
    for pattern in "${secret_patterns[@]}"; do
        matches=$(grep -r -i -E "$pattern" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.git . || true)
        
        if [ -n "$matches" ]; then
            log_warning "Potential secrets found for pattern: $pattern"
            echo "$matches"
            found_secrets=true
        fi
    done
    
    if [ "$found_secrets" = false ]; then
        log_success "No potential secrets found in code"
    else
        log_error "Potential secrets found. Please review and remove them."
    fi
}

# Function to check file permissions
check_permissions() {
    log_info "Checking file permissions..."
    
    # Check for files with overly permissive permissions
    overly_permissive=$(find . -type f \( -perm -002 -o -perm -020 \) -not -path "./node_modules/*" -not -path "./.git/*" || true)
    
    if [ -n "$overly_permissive" ]; then
        log_warning "Files with overly permissive permissions found:"
        echo "$overly_permissive"
    else
        log_success "File permissions look good"
    fi
    
    # Check for executable files that shouldn't be
    unexpected_executables=$(find . -type f -executable -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.json" -not -path "./node_modules/*" -not -path "./.git/*" || true)
    
    if [ -n "$unexpected_executables" ]; then
        log_warning "Unexpected executable files found:"
        echo "$unexpected_executables"
    else
        log_success "No unexpected executable files found"
    fi
}

# Function to validate environment files
validate_env_files() {
    log_info "Validating environment files..."
    
    # Check if .env files are properly gitignored
    if [ -f ".env" ] && git check-ignore .env > /dev/null 2>&1; then
        log_success ".env file is properly gitignored"
    elif [ -f ".env" ]; then
        log_error ".env file exists but is not gitignored!"
    fi
    
    # Check for .env.example
    if [ -f ".env.example" ]; then
        log_success ".env.example file exists"
        
        # Check if all variables in .env.example have non-empty values in .env
        if [ -f ".env" ]; then
            while IFS= read -r line; do
                if [[ $line =~ ^[A-Z_]+=.* ]]; then
                    var_name=$(echo "$line" | cut -d'=' -f1)
                    if ! grep -q "^$var_name=" .env; then
                        log_warning "Environment variable $var_name is in .env.example but not in .env"
                    fi
                fi
            done < .env.example
        fi
    else
        log_warning ".env.example file not found"
    fi
}

# Function to run comprehensive security scan
run_security_scan() {
    log_info "Running comprehensive security scan..."
    
    audit_dependencies
    scan_secrets
    check_permissions
    validate_env_files
    
    log_success "Security scan completed"
}

# Function to generate security report
generate_report() {
    local output_file="security-report-$(date +%Y%m%d-%H%M%S).txt"
    
    log_info "Generating security report..."
    
    {
        echo "Security Report - $(date)"
        echo "================================"
        echo ""
        
        echo "Dependency Audit:"
        pnpm audit --json 2>/dev/null || echo "Audit failed"
        echo ""
        
        echo "Outdated Dependencies:"
        pnpm outdated 2>/dev/null || echo "No outdated dependencies"
        echo ""
        
        echo "File Permissions Check:"
        find . -type f \( -perm -002 -o -perm -020 \) -not -path "./node_modules/*" -not -path "./.git/*" || echo "No permission issues"
        echo ""
        
    } > "$output_file"
    
    log_success "Security report generated: $output_file"
}

# Main function
main() {
    case "$1" in
        "audit")
            audit_dependencies
            ;;
        "outdated")
            check_outdated
            ;;
        "update")
            update_dependencies "$2"
            ;;
        "secrets")
            scan_secrets
            ;;
        "permissions")
            check_permissions
            ;;
        "env")
            validate_env_files
            ;;
        "scan")
            run_security_scan
            ;;
        "report")
            generate_report
            ;;
        *)
            echo "Usage: $0 {audit|outdated|update|secrets|permissions|env|scan|report}"
            echo ""
            echo "Commands:"
            echo "  audit                    - Audit dependencies for vulnerabilities"
            echo "  outdated                 - Check for outdated dependencies"
            echo "  update [patch|minor|major] - Update dependencies"
            echo "  secrets                  - Scan for potential secrets in code"
            echo "  permissions              - Check file permissions"
            echo "  env                      - Validate environment files"
            echo "  scan                     - Run comprehensive security scan"
            echo "  report                   - Generate security report"
            echo ""
            echo "Examples:"
            echo "  $0 audit"
            echo "  $0 update patch"
            echo "  $0 scan"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"