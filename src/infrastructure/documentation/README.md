# API Documentation Infrastructure

This module provides comprehensive API documentation capabilities for the Enterprise Authentication API, including interactive documentation, SDK generation, integration guides, and troubleshooting resources.

## Features

### 🔧 Interactive API Documentation

- **Swagger UI** - Interactive API explorer with try-it-out functionality
- **OpenAPI 3.0 Specification** - Complete machine-readable API specification
- **Request/Response Examples** - Real-world examples for all endpoints
- **Authentication Testing** - Built-in authentication flow testing

### 📚 Integration Guides

- **Quick Start Guide** - Get started in 5 minutes
- **OAuth Integration** - Complete OAuth2/OpenID Connect setup
- **MFA Setup** - Multi-factor authentication implementation
- **Passwordless Auth** - WebAuthn and magic link integration
- **Webhook Integration** - Real-time event handling
- **Enterprise Deployment** - Production deployment guide

### 🛠️ SDK Generation

- **JavaScript/TypeScript** - Full-featured SDK with automatic token management
- **Python** - Complete SDK with async support and type hints
- **PHP** - SDK with Guzzle HTTP client support
- **cURL** - Comprehensive command-line examples
- **Java/C#** - Basic structure (full SDKs via OpenAPI Generator)

### 🔍 Troubleshooting Resources

- **Common Issues** - Solutions to frequently encountered problems
- **FAQ** - Answers to common questions
- **Error Code Reference** - Complete error code documentation
- **Debugging Guide** - Step-by-step debugging procedures

### 🔎 Search and Discovery

- **Full-text Search** - Search across all documentation
- **Content Filtering** - Filter by content type and difficulty
- **Sitemap** - Complete documentation structure
- **Table of Contents** - Auto-generated navigation

## Usage

### Basic Setup

```typescript
import { documentationPlugin } from './infrastructure/documentation';

// Register documentation plugin
await fastify.register(documentationPlugin, {
  enableDocs: true,
  enableSwaggerUi: true,
  environment: 'development',
});
```

### Advanced Configuration

```typescript
await fastify.register(documentationPlugin, {
  enableDocs: process.env.NODE_ENV !== 'production',
  enableSwaggerUi: true,
  customRoutePrefix: '/api-docs',
  environment: process.env.NODE_ENV,
});
```

## Available Endpoints

### Interactive Documentation

- `GET /docs` - Swagger UI interface
- `GET /docs/json` - OpenAPI JSON specification
- `GET /docs/yaml` - OpenAPI YAML specification
- `GET /docs/info` - Documentation metadata

### Integration Guides

- `GET /docs/guides` - List all integration guides
- `GET /docs/guides/{guide}` - Get specific integration guide
- `GET /docs/guides/{guide}?format=json` - Get guide with metadata

### SDK Generation

- `GET /docs/sdk/{language}` - Generate SDK for specified language
- `GET /docs/sdk/javascript` - JavaScript/TypeScript SDK
- `GET /docs/sdk/python` - Python SDK
- `GET /docs/sdk/curl` - cURL examples
- `GET /docs/sdk/php` - PHP SDK

### Troubleshooting

- `GET /docs/troubleshooting/{guide}` - Get troubleshooting guide
- `GET /docs/troubleshooting/common-issues` - Common issues and solutions
- `GET /docs/troubleshooting/faq` - Frequently asked questions

### Search and Discovery

- `GET /docs/search?q={query}` - Search documentation
- `GET /docs/sitemap` - Complete documentation structure
- `GET /docs/postman` - Export Postman collection

## File Structure

```
src/infrastructure/documentation/
├── index.ts                    # Main exports
├── documentation-plugin.ts     # Fastify plugin
├── swagger-config.ts          # OpenAPI configuration
├── sdk-generator.ts           # SDK generation utilities
├── guide-routes.ts            # Integration guide routes
└── README.md                  # This file

docs/
├── integration-guides/
│   ├── quick-start.md
│   ├── oauth-integration.md
│   ├── mfa-setup.md
│   ├── passwordless-auth.md
│   ├── webhook-integration.md
│   └── enterprise-deployment.md
└── troubleshooting/
    ├── common-issues.md
    ├── faq.md
    ├── error-codes.md
    └── debugging.md
```

## Configuration Options

### DocumentationPluginOptions

```typescript
interface DocumentationPluginOptions {
  enableDocs?: boolean; // Enable documentation (default: true)
  enableSwaggerUi?: boolean; // Enable Swagger UI (default: true)
  customRoutePrefix?: string; // Custom route prefix
  environment?: string; // Environment (development/staging/production)
}
```

### SDKGeneratorOptions

```typescript
interface SDKGeneratorOptions {
  language: 'javascript' | 'python' | 'curl' | 'php' | 'java' | 'csharp';
  packageName?: string; // Package/module name
  version?: string; // SDK version
  baseUrl?: string; // API base URL
}
```

### GuideRoutesOptions

```typescript
interface GuideRoutesOptions {
  docsPath?: string; // Path to documentation files
  enableMarkdownRendering?: boolean; // Enable markdown to HTML conversion
}
```

## Customization

### Adding New Integration Guides

1. Create a new markdown file in `docs/integration-guides/`
2. Add the guide to the enum in `guide-routes.ts`
3. Update the sitemap in the `/docs/sitemap` endpoint

### Adding New SDK Languages

1. Implement the generator function in `sdk-generator.ts`
2. Add the language to the supported languages enum
3. Update the content type mapping

### Customizing Swagger UI

Modify `swagger-config.ts` to customize:

- UI configuration options
- Theme and styling
- Plugin configuration
- Security schemes

## Examples

### Generate JavaScript SDK

```bash
curl -X GET "https://api.example.com/docs/sdk/javascript" \
  -H "Accept: application/javascript" \
  -o enterprise-auth-client.js
```

### Search Documentation

```bash
curl -X GET "https://api.example.com/docs/search?q=oauth&type=guides&limit=5" \
  -H "Accept: application/json"
```

### Get Integration Guide

```bash
curl -X GET "https://api.example.com/docs/guides/quick-start?format=json" \
  -H "Accept: application/json"
```

## Development

### Adding New Features

1. **New Documentation Type**: Add to `guide-routes.ts`
2. **New SDK Language**: Add to `sdk-generator.ts`
3. **New Search Feature**: Modify search function in `guide-routes.ts`

### Testing Documentation

```bash
# Start development server
npm run dev

# Access documentation
open http://localhost:3000/docs

# Test SDK generation
curl http://localhost:3000/docs/sdk/javascript

# Test search
curl "http://localhost:3000/docs/search?q=authentication"
```

### Performance Considerations

- **Caching**: Markdown files are read on each request (consider caching in production)
- **Search**: Simple text search (consider using a search engine for large documentation)
- **SDK Generation**: Generated on-demand (consider pre-generating for popular languages)

## Security

### Production Deployment

- **Disable in Production**: Set `enableDocs: false` for production environments
- **Access Control**: Implement authentication for sensitive documentation
- **Rate Limiting**: Apply rate limits to documentation endpoints
- **CORS**: Configure appropriate CORS policies

### Content Security

- **Input Sanitization**: Search queries are sanitized
- **Path Traversal**: File paths are validated
- **XSS Prevention**: HTML output is properly escaped

## Troubleshooting

### Common Issues

1. **Documentation not loading**: Check `enableDocs` configuration
2. **Swagger UI not working**: Verify `enableSwaggerUi` setting
3. **SDK generation fails**: Check language parameter and OpenAPI spec
4. **Search not working**: Verify documentation files exist

### Debug Mode

Enable debug logging:

```typescript
await fastify.register(documentationPlugin, {
  enableDocs: true,
  environment: 'development',
});

// Check logs for documentation registration
fastify.log.info('Documentation features enabled');
```

## Contributing

### Adding Documentation

1. Create markdown files following the existing structure
2. Use proper heading hierarchy (H1 for title, H2 for sections)
3. Include code examples with proper syntax highlighting
4. Add table of contents for long documents

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Include error handling for file operations

### Testing

- Test all endpoints manually
- Verify SDK generation for all languages
- Check search functionality
- Validate HTML output

## Support

For issues related to the documentation system:

1. Check this README for common solutions
2. Review the troubleshooting guides
3. Search existing GitHub issues
4. Create a new issue with detailed information

## License

This documentation infrastructure is part of the Enterprise Authentication API and follows the same license terms.
