# Domain Layer

This layer contains the core business logic and domain entities. It should be independent of external concerns and frameworks.

## Structure

- `entities/` - Domain entities with business logic
- `value-objects/` - Immutable value objects
- `services/` - Domain services for complex business operations
- `events/` - Domain events
- `repositories/` - Repository interfaces (implementations in infrastructure)
- `errors/` - Domain-specific errors