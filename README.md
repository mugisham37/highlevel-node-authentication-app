# Enterprise Authentication Backend

An enterprise-grade authentication backend built with Node.js, TypeScript, and Fastify following Domain-Driven Design (DDD) principles.

## Features

- **High-Performance Framework**: Built on Fastify for optimal performance
- **TypeScript**: Full type safety and modern JavaScript features
- **Domain-Driven Design**: Clean architecture with proper separation of concerns
- **Security First**: Helmet, CORS, rate limiting, and comprehensive error handling
- **Observability**: Winston logging with correlation IDs and structured logging
- **Environment Management**: Type-safe configuration with Zod validation
- **Testing**: Comprehensive test suite with Vitest
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation

## Project Structure

```
src/
├── domain/           # Domain entities, value objects, and business logic
├── application/      # Application services, commands, and queries (CQRS)
├── infrastructure/   # External concerns (database, cache, external services)
│   ├── config/       # Environment configuration
│   ├── logging/      # Winston logger setup
│   └── server/       # Fastify server and plugins
├── presentation/     # HTTP controllers, routes, and validation
└── test/            # Test utilities and setup
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

### API Documentation

When running in development mode, API documentation is available at:

- Swagger UI: http://localhost:3000/docs

### Health Checks

- Health check: `GET /health`
- Readiness check: `GET /ready`

## Configuration

The application uses environment variables for configuration. See `.env.example` for all available options.

Key configuration areas:

- Server settings (host, port)
- Database connection
- Redis configuration
- JWT settings
- OAuth provider credentials
- Security settings
- Logging configuration

## Architecture

This application follows Domain-Driven Design principles with a layered architecture:

1. **Presentation Layer**: HTTP request handling, validation, and response formatting
2. **Application Layer**: Use case orchestration and application services
3. **Domain Layer**: Core business logic, entities, and domain services
4. **Infrastructure Layer**: External integrations, databases, and technical concerns

## Security Features

- Helmet.js for security headers
- CORS configuration
- Rate limiting
- Request validation with Zod
- Correlation ID tracking
- Comprehensive error handling
- Structured logging

## Testing

The project uses Vitest for testing with:

- Unit tests for individual components
- Integration tests for API endpoints
- Test utilities and setup helpers

Run tests with:

```bash
npm test          # Run once
npm run test:watch # Watch mode
```

## Development Guidelines

- Follow TypeScript strict mode
- Use ESLint and Prettier for code formatting
- Write tests for new features
- Follow the established architecture patterns
- Use structured logging with correlation IDs

## Next Steps

This foundation provides the core infrastructure for building enterprise authentication features including:

- User authentication and authorization
- OAuth2/OpenID Connect integration
- Multi-factor authentication
- Session management
- Role-based access control
- Audit logging
- Performance monitoring

Each feature will be built following the established patterns and architecture.
