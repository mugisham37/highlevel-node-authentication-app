#!/bin/sh

# Docker Health Check Script for Enterprise Auth Backend
# This script is used by Docker's HEALTHCHECK instruction

set -e

# Configuration
HEALTH_URL="http://localhost:3000/health"
TIMEOUT=10
MAX_RETRIES=3

# Function to check health endpoint
check_health() {
    local retry_count=0
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if curl -f -s --max-time $TIMEOUT "$HEALTH_URL" > /dev/null 2>&1; then
            echo "Health check passed"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            echo "Health check failed, retrying... ($retry_count/$MAX_RETRIES)"
            sleep 2
        fi
    done
    
    echo "Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Check if curl is available
if ! command -v curl > /dev/null 2>&1; then
    echo "curl is not available, cannot perform health check"
    exit 1
fi

# Perform health check
check_health