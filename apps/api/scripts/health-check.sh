#!/bin/bash

# Health Check Script for Enterprise Auth Backend
# This script performs comprehensive health checks on all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
VERBOSE=false
JSON_OUTPUT=false

# Function to print colored output
print_status() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

print_success() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

print_warning() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${YELLOW}[WARNING]${NC} $1"
    fi
}

print_error() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${RED}[ERROR]${NC} $1"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Set environment (development|production) [default: development]"
    echo "  -v, --verbose           Show detailed output"
    echo "  -j, --json              Output results in JSON format"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production                    # Check production environment"
    echo "  $0 -e development -v               # Verbose output for development"
    echo "  $0 -j                              # JSON output"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -j|--json)
            JSON_OUTPUT=true
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

# Initialize results
declare -A RESULTS
OVERALL_STATUS="healthy"

# Set Docker Compose file based on environment
if [[ "$ENVIRONMENT" == "production" ]]; then
    COMPOSE_FILE="docker-compose.prod.yml"
else
    COMPOSE_FILE="docker-compose.yml"
fi

# Check if Docker Compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    print_error "Docker Compose file not found: $COMPOSE_FILE"
    exit 1
fi

print_status "Performing health checks for environment: $ENVIRONMENT"

# Function to check service health
check_service_health() {
    local service_name=$1
    local health_url=$2
    local expected_status=${3:-200}
    
    print_status "Checking $service_name..."
    
    if curl -f -s -o /dev/null -w "%{http_code}" "$health_url" | grep -q "$expected_status"; then
        RESULTS[$service_name]="healthy"
        print_success "$service_name is healthy"
        return 0
    else
        RESULTS[$service_name]="unhealthy"
        OVERALL_STATUS="unhealthy"
        print_error "$service_name is unhealthy"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    print_status "Checking PostgreSQL database..."
    
    if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U auth_user -d enterprise_auth > /dev/null 2>&1; then
        RESULTS["database"]="healthy"
        print_success "Database is healthy"
        
        if [[ "$VERBOSE" == true ]]; then
            print_status "Database connection details:"
            docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U auth_user -d enterprise_auth -c "SELECT version();" 2>/dev/null || true
        fi
        return 0
    else
        RESULTS["database"]="unhealthy"
        OVERALL_STATUS="unhealthy"
        print_error "Database is unhealthy"
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    print_status "Checking Redis cache..."
    
    if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping | grep -q "PONG"; then
        RESULTS["redis"]="healthy"
        print_success "Redis is healthy"
        
        if [[ "$VERBOSE" == true ]]; then
            print_status "Redis info:"
            docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli info server | head -10 2>/dev/null || true
        fi
        return 0
    else
        RESULTS["redis"]="unhealthy"
        OVERALL_STATUS="unhealthy"
        print_error "Redis is unhealthy"
        return 1
    fi
}

# Function to check container status
check_containers() {
    print_status "Checking container status..."
    
    local unhealthy_containers=0
    
    while IFS= read -r line; do
        if echo "$line" | grep -q "unhealthy\|exited"; then
            unhealthy_containers=$((unhealthy_containers + 1))
            if [[ "$VERBOSE" == true ]]; then
                print_warning "Unhealthy container: $line"
            fi
        fi
    done < <(docker-compose -f "$COMPOSE_FILE" ps)
    
    if [[ $unhealthy_containers -eq 0 ]]; then
        RESULTS["containers"]="healthy"
        print_success "All containers are healthy"
        return 0
    else
        RESULTS["containers"]="unhealthy"
        OVERALL_STATUS="unhealthy"
        print_error "$unhealthy_containers container(s) are unhealthy"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    print_status "Checking disk space..."
    
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ $disk_usage -lt 90 ]]; then
        RESULTS["disk_space"]="healthy"
        print_success "Disk space is healthy ($disk_usage% used)"
        return 0
    elif [[ $disk_usage -lt 95 ]]; then
        RESULTS["disk_space"]="warning"
        print_warning "Disk space is getting low ($disk_usage% used)"
        return 0
    else
        RESULTS["disk_space"]="critical"
        OVERALL_STATUS="unhealthy"
        print_error "Disk space is critically low ($disk_usage% used)"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    print_status "Checking memory usage..."
    
    local memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [[ $memory_usage -lt 80 ]]; then
        RESULTS["memory"]="healthy"
        print_success "Memory usage is healthy ($memory_usage% used)"
        return 0
    elif [[ $memory_usage -lt 90 ]]; then
        RESULTS["memory"]="warning"
        print_warning "Memory usage is high ($memory_usage% used)"
        return 0
    else
        RESULTS["memory"]="critical"
        OVERALL_STATUS="unhealthy"
        print_error "Memory usage is critically high ($memory_usage% used)"
        return 1
    fi
}

# Perform health checks
check_containers
check_database
check_redis
check_service_health "application" "http://localhost:3000/health"
check_service_health "prometheus" "http://localhost:9090/-/healthy"
check_service_health "grafana" "http://localhost:3001/api/health"
check_disk_space
check_memory

# Output results
if [[ "$JSON_OUTPUT" == true ]]; then
    # JSON output
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"environment\": \"$ENVIRONMENT\","
    echo "  \"overall_status\": \"$OVERALL_STATUS\","
    echo "  \"services\": {"
    
    first=true
    for service in "${!RESULTS[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            echo ","
        fi
        echo -n "    \"$service\": \"${RESULTS[$service]}\""
    done
    echo ""
    echo "  }"
    echo "}"
else
    # Human-readable output
    echo ""
    print_status "Health Check Summary:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Overall Status: $OVERALL_STATUS"
    echo "  Timestamp: $(date)"
    echo ""
    
    for service in "${!RESULTS[@]}"; do
        status="${RESULTS[$service]}"
        case $status in
            "healthy")
                echo -e "  ${GREEN}✓${NC} $service: $status"
                ;;
            "warning")
                echo -e "  ${YELLOW}⚠${NC} $service: $status"
                ;;
            *)
                echo -e "  ${RED}✗${NC} $service: $status"
                ;;
        esac
    done
fi

# Exit with appropriate code
if [[ "$OVERALL_STATUS" == "healthy" ]]; then
    exit 0
else
    exit 1
fi