# Development Workflow Guide

This document outlines the development workflow for the fullstack monolith
project, including setup, development practices, and deployment procedures.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Code Generation](#code-generation)
- [Testing Strategy](#testing-strategy)
- [Code Quality](#code-quality)
- [Git Workflow](#git-workflow)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker and Docker Compose
- Git

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd fullstack-monolith
   ```

2. **Run the setup script**

   ```bash
   # On Unix/Linux/macOS
   ./tools/scripts/setup.sh

   # On Windows
   .\tools\scripts\setup.ps1
   ```

3. **Verify the setup**
   ```bash
   pnpm run dev
   ```

## Development Environment

### Services

The development environment includes the following services:

- **PostgreSQL** (port 5432) - Main database
- **Redis** (port 6379) - Cache and sessions
- **Mailhog** (port 8025) - Email testing
- **Test PostgreSQL** (port 5433) - Test database
- **Test Redis** (port 6380) - Test cache

### Environment Variables

Copy `.env.example` to `.env` and configure the following:

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fullstack_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-key
```

### Starting Services

```bash
# Start all development services
cd tools/build
docker-compose up -d

# Check service status
docker-compose ps
```

## Code Generation

We use Plop.js for code generation to maintain consistency across the codebase.

### Available Generators

#### Component Generator

```bash
pnpm plop component
```

Creates a new React component with:

- Component file with TypeScript
- Index file for exports
- Test file (optional)
- Storybook story (for UI package)

#### Page Generator

```bash
pnpm plop page
```

Creates a new page component for web or mobile apps.

#### API Route Generator

```bash
pnpm plop api-route
```

Creates a new API route with:

- tRPC router definition
- Input validation schemas
- API handler implementation
- Test file

#### Package Generator

```bash
pnpm plop package
```

Creates a new package with:

- package.json configuration
- TypeScript configuration
- Jest configuration
- Basic structure

### Custom Templates

Templates are located in `tools/generators/templates/` and use Handlebars
syntax.

## Testing Strategy

### Test Types

1. **Unit Tests** (70% coverage target)
   - Test individual functions and components
   - Fast execution
   - Mock external dependencies

2. **Integration Tests** (20% coverage target)
   - Test package interactions
   - Database operations
   - API endpoints

3. **End-to-End Tests** (10% coverage target)
   - Complete user workflows
   - Cross-browser testing (web)
   - Device testing (mobile)

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @company/shared test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e

# List available tests
./tools/scripts/test.sh list
```

### Test Configuration

- **Jest** - Unit and integration tests
- **Playwright** - Web E2E tests
- **Detox** - Mobile E2E tests

## Code Quality

### Formatting and Linting

```bash
# Format code
./tools/scripts/format.sh format fix

# Lint code
./tools/scripts/format.sh lint fix

# Check TypeScript types
./tools/scripts/format.sh types

# Run all quality checks
./tools/scripts/format.sh all fix
```

### Pre-commit Hooks

Pre-commit hooks automatically run:

- ESLint with auto-fix
- Prettier formatting
- TypeScript type checking
- Commit message linting

### Code Quality Metrics

```bash
# Check code quality metrics
./tools/scripts/format.sh metrics
```

Checks for:

- TODO/FIXME comments
- Console.log statements
- Large files (>500 lines)
- Code complexity

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Critical fixes
- `chore/description` - Maintenance tasks

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(auth): add two-factor authentication
fix(api): resolve user registration bug
docs(readme): update installation instructions
chore(deps): update dependencies
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes and commit
3. Push branch and create PR
4. Ensure CI passes
5. Request code review
6. Merge after approval

## Deployment

### Environments

- **Development** - Local development
- **Staging** - Pre-production testing
- **Production** - Live environment

### Deployment Commands

```bash
# Deploy to staging
./tools/scripts/deploy.sh staging

# Deploy to production
./tools/scripts/deploy.sh production

# Check deployment status
./tools/scripts/deploy.sh status production

# Rollback deployment
./tools/scripts/deploy.sh rollback production v1.2.3
```

### CI/CD Pipeline

The CI/CD pipeline includes:

1. Code quality checks
2. Security scanning
3. Test execution
4. Build verification
5. Deployment to staging
6. Manual approval for production
7. Production deployment

## Security

### Security Scanning

```bash
# Run security audit
./tools/scripts/security.sh audit

# Scan for secrets
./tools/scripts/security.sh secrets

# Check file permissions
./tools/scripts/security.sh permissions

# Full security scan
./tools/scripts/security.sh scan
```

### Dependency Management

```bash
# Check for outdated dependencies
./tools/scripts/security.sh outdated

# Update dependencies
./tools/scripts/security.sh update patch
```

## Database Management

### Migrations

```bash
# Run migrations
./tools/scripts/migrate.sh dev

# Create new migration
./tools/scripts/migrate.sh create "add_user_table"

# Reset database
./tools/scripts/migrate.sh reset

# Check migration status
./tools/scripts/migrate.sh status
```

### Seeding

```bash
# Seed development data
./tools/scripts/seed.sh dev

# Seed test data
./tools/scripts/seed.sh test

# Create sample users
./tools/scripts/seed.sh users
```

## Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check Docker status
docker ps

# Restart services
cd tools/build
docker-compose restart

# Check logs
docker-compose logs
```

#### Database Connection Issues

```bash
# Check database status
docker exec fullstack-postgres pg_isready -U postgres

# Reset database
./tools/scripts/migrate.sh reset
```

#### Build Failures

```bash
# Clean build cache
pnpm clean

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Check TypeScript errors
pnpm type-check
```

#### Test Failures

```bash
# Run tests with verbose output
pnpm test --verbose

# Check test setup
./tools/scripts/test.sh validate

# Clear test cache
pnpm jest --clearCache
```

### Getting Help

1. Check this documentation
2. Review error logs
3. Check GitHub issues
4. Ask team members
5. Create new issue if needed

## Best Practices

### Code Organization

- Keep components small and focused
- Use TypeScript for type safety
- Write tests for all new code
- Follow naming conventions
- Document complex logic

### Performance

- Use React.memo for expensive components
- Implement proper caching strategies
- Optimize database queries
- Monitor bundle sizes
- Use lazy loading where appropriate

### Security

- Never commit secrets
- Validate all inputs
- Use HTTPS in production
- Keep dependencies updated
- Follow security best practices

### Accessibility

- Use semantic HTML
- Provide alt text for images
- Ensure keyboard navigation
- Test with screen readers
- Follow WCAG guidelines

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Jest Documentation](https://jestjs.io/docs)
- [Playwright Documentation](https://playwright.dev/docs)
