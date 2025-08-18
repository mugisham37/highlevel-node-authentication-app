# Fullstack Monolith

A comprehensive fullstack monolith built with modern technologies, featuring shared packages, multiple applications, and enterprise-grade development infrastructure.

## 🏗️ Architecture

This monorepo contains:

- **Applications** (`apps/`): Web, mobile, and API applications
- **Packages** (`packages/`): Shared libraries and utilities
- **Tools** (`tools/`): Development tools and scripts
- **Infrastructure** (`infrastructure/`): Deployment configurations

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd fullstack-monolith

# Quick setup (installs deps, builds, migrates DB, seeds data)
make quick-start

# Or step by step:
make setup
make dev
```

## 📦 Package Structure

### Applications
- `apps/api` - Node.js API server with Fastify
- `apps/web` - Next.js web application
- `apps/mobile` - React Native mobile application

### Shared Packages
- `packages/shared` - Core domain logic and utilities
- `packages/database` - Database layer with Prisma/Drizzle
- `packages/auth` - Authentication and authorization
- `packages/config` - Configuration management
- `packages/cache` - Caching infrastructure
- `packages/logger` - Logging utilities
- `packages/notifications` - Notification services
- `packages/ui` - Shared UI components
- `packages/api-contracts` - tRPC API contracts

## 🛠️ Development

### Prerequisites

- Node.js 18.19.0+ (see `.nvmrc`)
- pnpm 8.0.0+
- PostgreSQL 15+
- Redis 6+

### Available Commands

```bash
# Development
make dev              # Start all development servers
make dev-api          # Start only API server
make dev-web          # Start only web server

# Building
make build            # Build all packages
make build-affected   # Build only changed packages

# Testing
make test             # Run all tests
make test-coverage    # Run tests with coverage
make test-e2e         # Run end-to-end tests

# Code Quality
make lint             # Run linting
make format           # Format code
make type-check       # TypeScript type checking

# Database
make db-migrate       # Run migrations
make db-seed          # Seed database
make db-reset         # Reset database

# Utilities
make clean            # Clean build artifacts
make health-check     # Check service health
```

### Development Workflow

1. **Setup**: Run `make setup` for initial project setup
2. **Development**: Use `make dev` to start all services
3. **Testing**: Run `make test` before committing
4. **Code Quality**: Pre-commit hooks handle linting and formatting
5. **Database**: Use `make db-migrate` and `make db-seed` for database changes

## 🏛️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma/Drizzle ORM
- **Cache**: Redis
- **Authentication**: JWT, OAuth, WebAuthn, MFA
- **API**: tRPC for type-safe communication

### Frontend
- **Web**: Next.js 14 with React 18
- **Mobile**: React Native with Expo
- **UI**: Tailwind CSS with custom component library
- **State**: React Query for server state

### Development
- **Monorepo**: pnpm workspaces with Turborepo
- **Language**: TypeScript with strict configuration
- **Testing**: Jest, Playwright, Detox
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **Git Hooks**: Husky with lint-staged

### Infrastructure
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Kubernetes
- **IaC**: Terraform
- **Monitoring**: Grafana, Prometheus
- **CI/CD**: GitHub Actions

## 📁 Project Structure

```
├── apps/
│   ├── api/                 # Node.js API server
│   ├── web/                 # Next.js web application
│   └── mobile/              # React Native mobile app
├── packages/
│   ├── shared/              # Core domain logic
│   ├── database/            # Database layer
│   ├── auth/                # Authentication
│   ├── config/              # Configuration
│   ├── cache/               # Caching
│   ├── logger/              # Logging
│   ├── notifications/       # Notifications
│   ├── ui/                  # UI components
│   └── api-contracts/       # tRPC contracts
├── tools/
│   ├── scripts/             # Development scripts
│   └── generators/          # Code generators
├── infrastructure/
│   ├── docker/              # Docker configurations
│   ├── kubernetes/          # K8s manifests
│   ├── terraform/           # Infrastructure as code
│   └── monitoring/          # Monitoring setup
├── docs/                    # Documentation
└── [config files]          # Workspace configuration
```

## 🔒 Security Features

- **Multi-Factor Authentication**: TOTP, SMS, Email, WebAuthn
- **OAuth Integration**: Google, GitHub, Microsoft
- **Enterprise SSO**: SAML, LDAP support
- **Session Management**: Secure session handling
- **Rate Limiting**: Redis-based rate limiting
- **Input Validation**: Zod schema validation
- **Security Headers**: Comprehensive security headers
- **Audit Logging**: Complete audit trail

## 🚀 Deployment

### Development
```bash
make docker-up    # Start with Docker Compose
```

### Production
```bash
make deploy       # Deploy to production
```

### Infrastructure
- Kubernetes manifests in `infrastructure/kubernetes/`
- Terraform configurations in `infrastructure/terraform/`
- Docker configurations in `infrastructure/docker/`

## 📊 Monitoring

- **Metrics**: Prometheus with custom metrics
- **Dashboards**: Grafana dashboards
- **Logging**: Structured logging with Winston
- **Tracing**: Distributed tracing support
- **Health Checks**: Comprehensive health endpoints

## 🤝 Contributing

1. **Setup**: Run `make setup` to prepare development environment
2. **Branch**: Create feature branch from `main`
3. **Develop**: Make changes with tests
4. **Quality**: Run `make full-check` before committing
5. **Commit**: Use conventional commit format
6. **PR**: Create pull request with description

### Commit Convention

```
type(scope): description

feat(auth): add WebAuthn support
fix(api): resolve user session timeout
docs(readme): update setup instructions
```

## 📚 Documentation

- [API Documentation](./docs/api.md)
- [Architecture Decisions](./docs/adr/)
- [Development Guide](./docs/development.md)
- [Deployment Guide](./docs/deployment.md)

## 📄 License

[MIT License](./LICENSE)

## 🆘 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: `/docs` directory
- **Health Checks**: `make health-check`