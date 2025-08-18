#!/bin/bash

# Deployment Automation Script
# Handles deployment to different environments

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

# Configuration
DOCKER_REGISTRY="${DOCKER_REGISTRY:-your-registry.com}"
PROJECT_NAME="${PROJECT_NAME:-fullstack-monolith}"
VERSION="${VERSION:-$(git rev-parse --short HEAD)}"

# Function to build Docker images
build_images() {
    local environment="$1"
    
    log_info "Building Docker images for $environment environment..."
    
    # Build API image
    if [ -d "apps/api" ]; then
        log_info "Building API image..."
        docker build -f apps/api/Dockerfile -t "$DOCKER_REGISTRY/$PROJECT_NAME-api:$VERSION" .
        docker tag "$DOCKER_REGISTRY/$PROJECT_NAME-api:$VERSION" "$DOCKER_REGISTRY/$PROJECT_NAME-api:latest"
        log_success "API image built successfully"
    fi
    
    # Build Web image
    if [ -d "apps/web" ]; then
        log_info "Building Web image..."
        docker build -f apps/web/Dockerfile -t "$DOCKER_REGISTRY/$PROJECT_NAME-web:$VERSION" .
        docker tag "$DOCKER_REGISTRY/$PROJECT_NAME-web:$VERSION" "$DOCKER_REGISTRY/$PROJECT_NAME-web:latest"
        log_success "Web image built successfully"
    fi
    
    # Build Mobile build image (for CI/CD)
    if [ -d "apps/mobile" ]; then
        log_info "Building Mobile build image..."
        docker build -f apps/mobile/Dockerfile -t "$DOCKER_REGISTRY/$PROJECT_NAME-mobile:$VERSION" .
        docker tag "$DOCKER_REGISTRY/$PROJECT_NAME-mobile:$VERSION" "$DOCKER_REGISTRY/$PROJECT_NAME-mobile:latest"
        log_success "Mobile build image built successfully"
    fi
}

# Function to push Docker images
push_images() {
    log_info "Pushing Docker images to registry..."
    
    # Push API image
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-api:$VERSION"
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-api:latest"
    
    # Push Web image
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-web:$VERSION"
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-web:latest"
    
    # Push Mobile image
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-mobile:$VERSION"
    docker push "$DOCKER_REGISTRY/$PROJECT_NAME-mobile:latest"
    
    log_success "All images pushed successfully"
}

# Function to deploy to staging
deploy_staging() {
    log_info "Deploying to staging environment..."
    
    # Build images
    build_images "staging"
    
    # Push images
    push_images
    
    # Deploy using Docker Compose (for staging)
    if [ -f "infrastructure/staging/docker-compose.yml" ]; then
        cd infrastructure/staging
        export VERSION="$VERSION"
        docker-compose pull
        docker-compose up -d
        cd ../..
        log_success "Staging deployment completed"
    else
        log_warning "Staging docker-compose.yml not found"
    fi
    
    # Run database migrations
    log_info "Running database migrations on staging..."
    ./tools/scripts/migrate.sh deploy
    
    # Health check
    health_check "staging"
}

# Function to deploy to production
deploy_production() {
    log_warning "Deploying to production environment..."
    log_warning "This will deploy to production!"
    
    read -p "Are you sure you want to deploy to production? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Production deployment cancelled."
        return
    fi
    
    # Build images
    build_images "production"
    
    # Push images
    push_images
    
    # Deploy using Kubernetes (for production)
    if [ -d "infrastructure/kubernetes" ]; then
        log_info "Deploying to Kubernetes..."
        cd infrastructure/kubernetes
        
        # Update image tags in manifests
        sed -i "s/:latest/:$VERSION/g" *.yaml
        
        # Apply manifests
        kubectl apply -f .
        
        # Wait for rollout
        kubectl rollout status deployment/api-deployment
        kubectl rollout status deployment/web-deployment
        
        cd ../..
        log_success "Kubernetes deployment completed"
    else
        log_warning "Kubernetes manifests not found"
    fi
    
    # Run database migrations
    log_info "Running database migrations on production..."
    ./tools/scripts/migrate.sh deploy
    
    # Health check
    health_check "production"
}

# Function to perform health checks
health_check() {
    local environment="$1"
    local api_url
    
    case "$environment" in
        "staging")
            api_url="https://staging-api.yourcompany.com"
            ;;
        "production")
            api_url="https://api.yourcompany.com"
            ;;
        *)
            api_url="http://localhost:3000"
            ;;
    esac
    
    log_info "Performing health check for $environment..."
    
    # Wait for services to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f "$api_url/health" > /dev/null 2>&1; then
            log_success "Health check passed for $environment"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: Waiting for services to be ready..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed for $environment"
    return 1
}

# Function to rollback deployment
rollback() {
    local environment="$1"
    local version="$2"
    
    if [ -z "$version" ]; then
        log_error "Version is required for rollback"
        echo "Usage: $0 rollback <environment> <version>"
        exit 1
    fi
    
    log_warning "Rolling back $environment to version $version..."
    
    case "$environment" in
        "staging")
            if [ -f "infrastructure/staging/docker-compose.yml" ]; then
                cd infrastructure/staging
                export VERSION="$version"
                docker-compose pull
                docker-compose up -d
                cd ../..
            fi
            ;;
        "production")
            if [ -d "infrastructure/kubernetes" ]; then
                cd infrastructure/kubernetes
                sed -i "s/:.*/:$version/g" *.yaml
                kubectl apply -f .
                kubectl rollout status deployment/api-deployment
                kubectl rollout status deployment/web-deployment
                cd ../..
            fi
            ;;
    esac
    
    log_success "Rollback completed for $environment"
}

# Function to show deployment status
status() {
    local environment="$1"
    
    log_info "Checking deployment status for $environment..."
    
    case "$environment" in
        "staging")
            if [ -f "infrastructure/staging/docker-compose.yml" ]; then
                cd infrastructure/staging
                docker-compose ps
                cd ../..
            fi
            ;;
        "production")
            if command -v kubectl &> /dev/null; then
                kubectl get deployments
                kubectl get pods
                kubectl get services
            fi
            ;;
        *)
            log_error "Unknown environment: $environment"
            ;;
    esac
}

# Main function
main() {
    case "$1" in
        "staging")
            deploy_staging
            ;;
        "production"|"prod")
            deploy_production
            ;;
        "build")
            build_images "$2"
            ;;
        "push")
            push_images
            ;;
        "rollback")
            rollback "$2" "$3"
            ;;
        "status")
            status "$2"
            ;;
        "health")
            health_check "$2"
            ;;
        *)
            echo "Usage: $0 {staging|production|build|push|rollback|status|health}"
            echo ""
            echo "Commands:"
            echo "  staging              - Deploy to staging environment"
            echo "  production           - Deploy to production environment"
            echo "  build <env>          - Build Docker images"
            echo "  push                 - Push Docker images to registry"
            echo "  rollback <env> <ver> - Rollback to specific version"
            echo "  status <env>         - Show deployment status"
            echo "  health <env>         - Perform health check"
            echo ""
            echo "Environment variables:"
            echo "  DOCKER_REGISTRY - Docker registry URL"
            echo "  PROJECT_NAME    - Project name for image tags"
            echo "  VERSION         - Version tag (defaults to git commit)"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"