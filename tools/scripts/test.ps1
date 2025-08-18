# Test Runner Script (PowerShell)
# Runs tests for specific packages or all packages

param(
    [string]$Command = "unit",
    [string]$Package = "",
    [string]$File = ""
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

# Function to run unit tests
function Invoke-UnitTests {
    param(
        [string]$Package,
        [bool]$Watch = $false
    )
    
    if ($Package) {
        Log-Info "Running unit tests for $Package..."
        if ($Watch) {
            pnpm --filter $Package run test:watch
        } else {
            pnpm --filter $Package run test
        }
    } else {
        Log-Info "Running all unit tests..."
        if ($Watch) {
            pnpm run test:watch
        } else {
            pnpm run test
        }
    }
}

# Function to run integration tests
function Invoke-IntegrationTests {
    param([string]$Package)
    
    Log-Info "Running integration tests..."
    
    # Start test services if needed
    if (Test-Path "tools/build/docker-compose.yml") {
        Log-Info "Starting test services..."
        Push-Location tools/build
        
        try {
            if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
                docker-compose up -d postgres-test redis-test
            } else {
                docker compose up -d postgres-test redis-test
            }
            
            # Wait for services to be ready
            Start-Sleep 5
        }
        finally {
            Pop-Location
        }
    }
    
    if ($Package) {
        pnpm --filter $Package run test:integration
    } else {
        pnpm run test:integration
    }
}

# Function to run E2E tests
function Invoke-E2ETests {
    param([string]$App)
    
    Log-Info "Running E2E tests..."
    
    switch ($App) {
        "web" {
            Log-Info "Running web E2E tests with Playwright..."
            pnpm playwright test
        }
        "mobile" {
            Log-Info "Running mobile E2E tests with Detox..."
            pnpm detox test
        }
        default {
            Log-Info "Running all E2E tests..."
            pnpm playwright test
            # Mobile tests would be run here if mobile app exists
        }
    }
}

# Function to run tests with coverage
function Invoke-Coverage {
    param([string]$Package)
    
    Log-Info "Running tests with coverage..."
    
    if ($Package) {
        pnpm --filter $Package run test:coverage
    } else {
        pnpm run test:coverage
    }
    
    Log-Info "Coverage report generated in coverage/ directory"
}

# Function to list available tests
function Get-TestList {
    Log-Info "Discovering available tests..."
    
    # Use Jest to list tests without running them
    pnpm jest --listTests --passWithNoTests
}

# Function to run specific test file
function Invoke-TestFile {
    param([string]$FilePath)
    
    if (-not $FilePath) {
        Log-Error "Test file path is required"
        exit 1
    }
    
    Log-Info "Running test file: $FilePath"
    pnpm jest $FilePath
}

# Function to validate test setup
function Test-Setup {
    Log-Info "Validating test setup..."
    
    # Check if Jest is configured
    if (-not (Test-Path "jest.config.js")) {
        Log-Error "Jest configuration not found"
        exit 1
    }
    
    # List tests to verify discovery works
    Log-Info "Discovering tests..."
    $result = pnpm jest --listTests --passWithNoTests 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Log-Success "Test discovery successful"
    } else {
        Log-Error "Test discovery failed"
        exit 1
    }
    
    # Check if Playwright is configured
    if (Test-Path "playwright.config.ts") {
        Log-Success "Playwright configuration found"
    } else {
        Log-Warning "Playwright configuration not found"
    }
    
    # Check if Detox is configured
    if (Test-Path ".detoxrc.js") {
        Log-Success "Detox configuration found"
    } else {
        Log-Warning "Detox configuration not found"
    }
    
    Log-Success "Test setup validation completed"
}

# Main execution
switch ($Command) {
    "unit" {
        Invoke-UnitTests -Package $Package
    }
    "integration" {
        Invoke-IntegrationTests -Package $Package
    }
    "e2e" {
        Invoke-E2ETests -App $Package
    }
    "coverage" {
        Invoke-Coverage -Package $Package
    }
    "watch" {
        Invoke-UnitTests -Package $Package -Watch $true
    }
    "list" {
        Get-TestList
    }
    "file" {
        Invoke-TestFile -FilePath $File
    }
    "validate" {
        Test-Setup
    }
    default {
        Write-Host "Usage: .\test.ps1 -Command {unit|integration|e2e|coverage|watch|list|file|validate} [-Package <package>] [-File <file>]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  unit         - Run unit tests (default)"
        Write-Host "  integration  - Run integration tests"
        Write-Host "  e2e          - Run E2E tests"
        Write-Host "  coverage     - Run tests with coverage"
        Write-Host "  watch        - Run tests in watch mode"
        Write-Host "  list         - List all available tests"
        Write-Host "  file         - Run specific test file"
        Write-Host "  validate     - Validate test setup"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\test.ps1 -Command unit -Package '@company/shared'"
        Write-Host "  .\test.ps1 -Command e2e -Package web"
        Write-Host "  .\test.ps1 -Command file -File 'src/utils/auth.test.ts'"
    }
}