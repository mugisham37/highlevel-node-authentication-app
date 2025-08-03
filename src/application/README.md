# Application Layer

This layer orchestrates domain objects to fulfill application use cases. It contains application services, commands, queries, and handlers.

## Structure

- `commands/` - Command objects and handlers (CQRS)
- `queries/` - Query objects and handlers (CQRS)
- `services/` - Application services for orchestration
- `dto/` - Data Transfer Objects
- `interfaces/` - Application service interfaces