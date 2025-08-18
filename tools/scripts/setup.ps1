# Development Environment Setup Script (PowerShell)
# This script sets up the complete development environment for the fullstack monolith

param(
    [string]$Command = "setup"
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"

# Logging functions
function Log-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Log-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Log-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Log-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Check if required tools are installed
function Test-Prerequisites {
    Log-Info "Checking prerequisites..."
    
    # Check Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Log-Error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    }
    
    # Check pnpm
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Log-Warning "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    }
    
    # Check Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Log-Error "Docker is not installed. Please install Docker."
        exit 1
    }
    
    # Check Docker Compose
    $dockerComposeExists = (Get-Command docker-compose -ErrorAction SilentlyContinue) -or 
                          (docker compose version 2>$null)
    if (-not $dockerComposeExists) {
        Log-Error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    }
    
    Log-Success "All prerequisites are installed."
}

# Install dependencies
function Install-Dependencies {
    Log-Info "Installing dependencies..."
    pnpm install
    Log-Success "Dependencies installed successfully."
}

# Setup environment files
function Set-Environment {
    Log-Info "Setting up environment files..."
    
    # Copy .env.example to .env if it doesn't exist
    if (-not (Test-Path .env)) {
        Copy-Item .env.example .env
        Log-Success "Created .env file from .env.example"
    } else {
        Log-Warning ".env file already exists, skipping..."
    }
    
    # Create environment files for each app if they don't exist
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        $envExample = Join-Path $_.FullName ".env.example"
        $envFile = Join-Path $_.FullName ".env"
        
        if ((Test-Path $envExample) -and (-not (Test-Path $envFile))) {
            Copy-Item $envExample $envFile
            Log-Success "Created .env file for $($_.Name)"
        }
    }
}

# Start development services
function Start-Services {
    Log-Info "Starting development services..."
    
    # Navigate to tools/build directory
    Push-Location tools/build
    
    try {
        # Start Docker services
        if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
            docker-compose up -d
        } else {
            docker compose up -d
        }
        
        # Wait for services to be healthy
        Log-Info "Waiting for services to be ready..."
        Start-Sleep 10
        
        # Check if PostgreSQL is ready
        do {
            Log-Info "Waiting for PostgreSQL to be ready..."
            Start-Sleep 2
        } while (-not (docker exec fullstack-postgres pg_isready -U postgres 2>$null))
        
        # Check if Redis is ready
        do {
            Log-Info "Waiting for Redis to be ready..."
            Start-Sleep 2
        } while (-not (docker exec fullstack-redis redis-cli ping 2>$null))
        
        Log-Success "Development services are running."
    }
    finally {
        Pop-Location
    }
}

# Run database migrations
function Invoke-Migrations {
    Log-Info "Running database migrations..."
    
    # Check if Prisma is available
    if (Test-Path "packages/database") {
        Push-Location packages/database
        
        try {
            $packageJson = Get-Content package.json | ConvertFrom-Json
            if ($packageJson.dependencies.prisma -or $packageJson.devDependencies.prisma) {
                pnpm prisma migrate dev --name init
                Log-Success "Prisma migrations completed."
            }
        }
        finally {
            Pop-Location
        }
    }
    
    # Check if Drizzle is available
    if (Test-Path "packages/database/src/drizzle") {
        Log-Info "Drizzle migrations would be run here (implementation depends on setup)"
    }
}

# Seed the database
function Invoke-DatabaseSeed {
    Log-Info "Seeding database..."
    
    if (Test-Path "packages/database") {
        Push-Location packages/database
        
        try {
            $packageJson = Get-Content package.json | ConvertFrom-Json
            if ($packageJson.scripts.seed) {
                pnpm run seed
                Log-Success "Database seeded successfully."
            }
        }
        finally {
            Pop-Location
        }
    }
}

# Build all packages
function Build-Packages {
    Log-Info "Building all packages..."
    pnpm run build
    Log-Success "All packages built successfully."
}

# Main setup function
function Invoke-Setup {
    Log-Info "Starting development environment setup..."
    
    Test-Prerequisites
    Install-Dependencies
    Set-Environment
    Start-Services
    Invoke-Migrations
    Invoke-DatabaseSeed
    Build-Packages
    
    Log-Success "Development environment setup completed!"
    Log-Info "You can now start development with: pnpm run dev"
    Log-Info "Services running:"
    Log-Info "  - PostgreSQL: localhost:5432"
    Log-Info "  - Redis: localhost:6379"
    Log-Info "  - Mailhog UI: http://localhost:8025"
    Log-Info "  - Test PostgreSQL: localhost:5433"
    Log-Info "  - Test Redis: localhost:6380"
}

# Main execution
switch ($Command) {
    "setup" { Invoke-Setup }
    "prerequisites" { Test-Prerequisites }
    "install" { Install-Dependencies }
    "env" { Set-Environment }
    "services" { Start-Services }
    "migrate" { Invoke-Migrations }
    "seed" { Invoke-DatabaseSeed }
    "build" { Build-Packages }
    default {
        Write-Host "Usage: .\setup.ps1 [setup|prerequisites|install|env|services|migrate|seed|build]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  setup         - Run complete setup (default)"
        Write-Host "  prerequisites - Check prerequisites only"
        Write-Host "  install       - Install dependencies only"
        Write-Host "  env           - Setup environment files only"
        Write-Host "  services      - Start services only"
        Write-Host "  migrate       - Run migrations only"
        Write-Host "  seed          - Seed database only"
        Write-Host "  build         - Build packages only"
    }
}