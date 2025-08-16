#!/bin/bash

# Enterprise Auth Backend - Load Balanced Deployment Script
# This script performs zero-downtime deployment with load balancing

set -e

# Configuration
COMPOSE_FILE="docker-compose.prod-lb.yml"
PROJECT_NAME="enterprise-auth"
HEALTH_CHECK_TIMEOUT=60
DRAIN_TIMEOUT=30

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
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is not installed"
        exit 1
    fi
    
    log_success "All dependencies are available"
}

# Check if environment variables are set
check_environment() {
    log_info "Checking environment variables..."
    
    required_vars=(
        "JWT_SECRET"
        "POSTGRES_PASSWORD"
        "GRAFANA_PASSWORD"
    )
    
    missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    log_success "Environment variables are set"
}

# Wait for service to be healthy
wait_for_health() {
    local service_name=$1
    local health_url=$2
    local timeout=${3:-$HEALTH_CHECK_TIMEOUT}
    
    log_info "Waiting for $service_name to be healthy..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f -s "$health_url" > /dev/null 2>&1; then
            log_success "$service_name is healthy"
            return 0
        fi
        
        echo -n "."
        sleep 2
    done
    
    log_error "$service_name failed to become healthy within ${timeout}s"
    return 1
}

# Drain traffic from a service instance
drain_instance() {
    local instance_name=$1
    local drain_url="http://localhost:3000/scaling/drain"
    
    log_info "Draining traffic from $instance_name..."
    
    # Send drain signal to the instance
    if docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T "$instance_name" \
        curl -f -s -X POST "$drain_url" > /dev/null 2>&1; then
        log_success "Drain signal sent to $instance_name"
        
        # Wait for drain timeout
        log_info "Waiting ${DRAIN_TIMEOUT}s for connections to drain..."
        sleep "$DRAIN_TIMEOUT"
        
        return 0
    else
        log_warning "Failed to send drain signal to $instance_name, proceeding anyway"
        return 1
    fi
}

# Rolling update deployment
rolling_update() {
    log_info "Starting rolling update deployment..."
    
    # Get list of application instances
    local instances=("auth-app-1" "auth-app-2")
    
    for instance in "${instances[@]}"; do
        log_info "Updating $instance..."
        
        # Drain traffic from the instance
        drain_instance "$instance" || true
        
        # Stop the instance
        log_info "Stopping $instance..."
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop "$instance"
        
        # Remove the old container
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" rm -f "$instance"
        
        # Start the new instance
        log_info "Starting new $instance..."
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d "$instance"
        
        # Wait for the instance to be healthy
        local health_url="http://localhost:8080/health"
        if wait_for_health "$instance" "$health_url" 120; then
            log_success "$instance updated successfully"
        else
            log_error "Failed to update $instance"
            
            # Rollback: start the old instance
            log_warning "Rolling back $instance..."
            docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d "$instance"
            exit 1
        fi
        
        # Wait a bit before updating the next instance
        log_info "Waiting 10s before updating next instance..."
        sleep 10
    done
    
    log_success "Rolling update completed successfully"
}

# Blue-green deployment
blue_green_deployment() {
    log_info "Starting blue-green deployment..."
    
    # This would require additional infrastructure setup
    # For now, we'll use rolling update as the primary strategy
    log_warning "Blue-green deployment not implemented, falling back to rolling update"
    rolling_update
}

# Canary deployment
canary_deployment() {
    log_info "Starting canary deployment..."
    
    # This would require traffic splitting capabilities
    # For now, we'll use rolling update as the primary strategy
    log_warning "Canary deployment not implemented, falling back to rolling update"
    rolling_update
}

# Build and push images
build_images() {
    log_info "Building application images..."
    
    # Build the application image
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build --no-cache
    
    log_success "Images built successfully"
}

# Start infrastructure services
start_infrastructure() {
    log_info "Starting infrastructure services..."
    
    # Start database and cache services first
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d postgres redis
    
    # Wait for database to be ready
    wait_for_health "postgres" "http://localhost:5432" 60 || {
        log_error "Database failed to start"
        exit 1
    }
    
    # Wait for Redis to be ready
    wait_for_health "redis" "http://localhost:6379" 30 || {
        log_error "Redis failed to start"
        exit 1
    }
    
    log_success "Infrastructure services started"
}

# Start monitoring services
start_monitoring() {
    log_info "Starting monitoring services..."
    
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d prometheus grafana
    
    log_success "Monitoring services started"
}

# Start load balancer
start_load_balancer() {
    log_info "Starting load balancer..."
    
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d nginx
    
    # Wait for load balancer to be ready
    wait_for_health "nginx" "http://localhost:8080/health" 30 || {
        log_error "Load balancer failed to start"
        exit 1
    }
    
    log_success "Load balancer started"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if all services are running
    local services=("nginx" "auth-app-1" "auth-app-2" "postgres" "redis" "prometheus" "grafana")
    
    for service in "${services[@]}"; do
        if docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps "$service" | grep -q "Up"; then
            log_success "$service is running"
        else
            log_error "$service is not running"
            return 1
        fi
    done
    
    # Test the application endpoints
    local endpoints=(
        "http://localhost/health"
        "http://localhost/scaling/status"
        "http://localhost:8080/health"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null 2>&1; then
            log_success "Endpoint $endpoint is responding"
        else
            log_error "Endpoint $endpoint is not responding"
            return 1
        fi
    done
    
    log_success "Deployment verification completed"
}

# Show deployment status
show_status() {
    log_info "Deployment Status:"
    echo
    
    # Show running services
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
    echo
    
    # Show service URLs
    log_info "Service URLs:"
    echo "  Application: http://localhost"
    echo "  Health Check: http://localhost:8080/health"
    echo "  Scaling Status: http://localhost/scaling/status"
    echo "  Prometheus: http://localhost:9090"
    echo "  Grafana: http://localhost:3001"
    echo
    
    # Show logs command
    log_info "To view logs:"
    echo "  docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f [service_name]"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    log_success "Cleanup completed"
}

# Main deployment function
deploy() {
    local strategy=${1:-"rolling"}
    
    log_info "Starting deployment with strategy: $strategy"
    
    # Pre-deployment checks
    check_dependencies
    check_environment
    
    # Build images
    build_images
    
    # Start infrastructure
    start_infrastructure
    
    # Perform deployment based on strategy
    case "$strategy" in
        "rolling")
            rolling_update
            ;;
        "blue-green")
            blue_green_deployment
            ;;
        "canary")
            canary_deployment
            ;;
        *)
            log_error "Unknown deployment strategy: $strategy"
            log_info "Available strategies: rolling, blue-green, canary"
            exit 1
            ;;
    esac
    
    # Start monitoring and load balancer
    start_monitoring
    start_load_balancer
    
    # Verify deployment
    verify_deployment
    
    # Show status
    show_status
    
    # Cleanup
    cleanup
    
    log_success "Deployment completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  deploy [strategy]    Deploy the application (default: rolling)"
    echo "  status              Show deployment status"
    echo "  logs [service]      Show logs for a service"
    echo "  stop                Stop all services"
    echo "  cleanup             Clean up unused resources"
    echo
    echo "Deployment strategies:"
    echo "  rolling             Rolling update (default)"
    echo "  blue-green          Blue-green deployment"
    echo "  canary              Canary deployment"
    echo
    echo "Examples:"
    echo "  $0 deploy rolling"
    echo "  $0 status"
    echo "  $0 logs auth-app-1"
    echo "  $0 stop"
}

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy "${2:-rolling}"
        ;;
    "status")
        show_status
        ;;
    "logs")
        if [[ -n "$2" ]]; then
            docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f "$2"
        else
            docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f
        fi
        ;;
    "stop")
        log_info "Stopping all services..."
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
        log_success "All services stopped"
        ;;
    "cleanup")
        cleanup
        ;;
    "help"|"-h"|"--help")
        usage
        ;;
    *)
        log_error "Unknown command: $1"
        usage
        exit 1
        ;;
esac