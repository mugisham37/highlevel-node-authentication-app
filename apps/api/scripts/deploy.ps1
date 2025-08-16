# Enterprise Auth Backend Deployment Script (PowerShell)
# This script handles deployment of the application in different environments

param(
    [string]$Environment = "development",
    [switch]$BuildOnly = $false,
    [switch]$SkipTests = $false,
    [switch]$SkipMigrations = $false,
    [switch]$ForceRebuild = $false,
    [switch]$Help = $false
)

# Function to show usage
function Show-Usage {
    Write-Host "Usage: .\deploy.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Environment ENV        Set environment (development|production) [default: development]"
    Write-Host "  -BuildOnly              Only build images, don't start services"
    Write-Host "  -SkipTests              Skip running tests before deployment"
    Write-Host "  -SkipMigrations         Skip database migrations"
    Write-Host "  -ForceRebuild           Force rebuild of all images"
    Write-Host "  -Help                   Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1 -Environment production                    # Deploy to production"
    Write-Host "  .\deploy.ps1 -Environment development -ForceRebuild    # Force rebuild in development"
    Write-Host "  .\deploy.ps1 -Environment production -BuildOnly        # Build production images only"
    Write-Host "  .\deploy.ps1 -Environment development -SkipTests -SkipMigrations  # Skip tests and migrations"
}

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Show help if requested
if ($Help) {
    Show-Usage
    exit 0
}

# Validate environment
if ($Environment -notin @("development", "production")) {
    Write-Error "Invalid environment: $Environment. Must be 'development' or 'production'"
    exit 1
}

Write-Status "Starting deployment for environment: $Environment"

# Set Docker Compose file based on environment
if ($Environment -eq "production") {
    $ComposeFile = "docker-compose.prod.yml"
    $DockerTarget = "runtime"
} else {
    $ComposeFile = "docker-compose.yml"
    $DockerTarget = "development"
}

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Error "Docker is not running. Please start Docker and try again."
    exit 1
}

# Check if required files exist
if (-not (Test-Path $ComposeFile)) {
    Write-Error "Docker Compose file not found: $ComposeFile"
    exit 1
}

if (-not (Test-Path "Dockerfile")) {
    Write-Error "Dockerfile not found"
    exit 1
}

# Load environment variables
if (Test-Path ".env") {
    Write-Status "Loading environment variables from .env file"
    Get-Content ".env" | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object {
        $name, $value = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
} elseif (Test-Path ".env.example") {
    Write-Warning ".env file not found, using .env.example"
    Get-Content ".env.example" | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object {
        $name, $value = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
} else {
    Write-Warning "No environment file found. Using default values."
}

# Run tests if not skipped
if (-not $SkipTests) {
    Write-Status "Running tests..."
    $testResult = npm test
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All tests passed"
    } else {
        Write-Error "Tests failed. Deployment aborted."
        exit 1
    }
}

# Build Docker images
Write-Status "Building Docker images..."
$buildArgs = @()
if ($ForceRebuild) {
    $buildArgs += "--no-cache"
}

$buildCommand = "docker-compose -f $ComposeFile build"
if ($buildArgs.Count -gt 0) {
    $buildCommand += " " + ($buildArgs -join " ")
}

Invoke-Expression $buildCommand
if ($LASTEXITCODE -eq 0) {
    Write-Success "Docker images built successfully"
} else {
    Write-Error "Failed to build Docker images"
    exit 1
}

# If build-only flag is set, exit here
if ($BuildOnly) {
    Write-Success "Build completed. Exiting as requested."
    exit 0
}

# Stop existing containers
Write-Status "Stopping existing containers..."
docker-compose -f $ComposeFile down

# Start services
Write-Status "Starting services..."
docker-compose -f $ComposeFile up -d
if ($LASTEXITCODE -eq 0) {
    Write-Success "Services started successfully"
} else {
    Write-Error "Failed to start services"
    exit 1
}

# Wait for services to be healthy
Write-Status "Waiting for services to be healthy..."
Start-Sleep -Seconds 10

# Check service health
Write-Status "Checking service health..."
$retries = 30
$retryCount = 0

while ($retryCount -lt $retries) {
    $psOutput = docker-compose -f $ComposeFile ps
    if ($psOutput -match "healthy") {
        Write-Success "Services are healthy"
        break
    }
    
    $retryCount++
    Write-Status "Waiting for services to be healthy... ($retryCount/$retries)"
    Start-Sleep -Seconds 5
}

if ($retryCount -eq $retries) {
    Write-Warning "Some services may not be fully healthy yet"
}

# Run database migrations if not skipped
if (-not $SkipMigrations) {
    Write-Status "Running database migrations..."
    docker-compose -f $ComposeFile exec -T app npm run db:migrate:up
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Database migrations completed"
    } else {
        Write-Warning "Database migrations failed or not needed"
    }
}

# Show running services
Write-Status "Deployment completed. Running services:"
docker-compose -f $ComposeFile ps

# Show service URLs
Write-Success "Service URLs:"
if ($Environment -eq "production") {
    Write-Host "  - Application: http://localhost:3000"
    Write-Host "  - Prometheus: http://localhost:9090"
    Write-Host "  - Grafana: http://localhost:3001 (admin/admin123)"
} else {
    Write-Host "  - Application: http://localhost:3000"
    Write-Host "  - Prometheus: http://localhost:9090"
    Write-Host "  - Grafana: http://localhost:3001 (admin/admin123)"
    Write-Host "  - Debug Port: 9229"
}

Write-Success "Deployment completed successfully!"

# Show logs command
Write-Status "To view logs, run:"
Write-Host "  docker-compose -f $ComposeFile logs -f"