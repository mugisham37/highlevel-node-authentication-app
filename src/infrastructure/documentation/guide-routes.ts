/**
 * Documentation Guide Routes
 * Serves integration guides, troubleshooting docs, and FAQ
 */

import { FastifyInstance } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { marked } from 'marked';

export interface GuideRoutesOptions {
  docsPath?: string;
  enableMarkdownRendering?: boolean;
}

/**
 * Register documentation guide routes
 */
export async function registerGuideRoutes(
  fastify: FastifyInstance,
  options: GuideRoutesOptions = {}
): Promise<void> {
  const {
    docsPath = join(process.cwd(), 'docs'),
    enableMarkdownRendering = true,
  } = options;

  // Configure marked for markdown rendering
  if (enableMarkdownRendering) {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  // Integration guides
  fastify.get(
    '/docs/guides/:guide',
    {
      schema: {
        tags: ['Documentation'],
        summary: 'Get integration guide',
        description: 'Retrieve a specific integration guide',
        params: {
          type: 'object',
          properties: {
            guide: {
              type: 'string',
              enum: [
                'quick-start',
                'oauth-integration',
                'mfa-setup',
                'passwordless-auth',
                'webhook-integration',
                'rbac-setup',
                'enterprise-deployment',
              ],
              description: 'Guide identifier',
            },
          },
          required: ['guide'],
        },
        querystring: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['markdown', 'html', 'json'],
              default: 'html',
              description: 'Response format',
            },
          },
        },
        response: {
          200: {
            oneOf: [
              {
                type: 'string',
                description: 'HTML or Markdown content',
              },
              {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  format: { type: 'string' },
                  lastModified: { type: 'string', format: 'date-time' },
                  tableOfContents: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        level: { type: 'number' },
                        title: { type: 'string' },
                        anchor: { type: 'string' },
                      },
                    },
                  },
                },
              },
            ],
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { guide } = request.params as { guide: string };
      const { format = 'html' } = request.query as { format?: string };

      try {
        const guidePath = join(docsPath, 'integration-guides', `${guide}.md`);
        const markdownContent = await readFile(guidePath, 'utf-8');

        if (format === 'markdown') {
          reply.type('text/markdown');
          return markdownContent;
        }

        if (format === 'json') {
          const htmlContent = enableMarkdownRendering
            ? marked(markdownContent)
            : markdownContent;
          const tableOfContents = extractTableOfContents(markdownContent);
          const title = extractTitle(markdownContent);

          return {
            title,
            content: htmlContent,
            format: 'html',
            lastModified: new Date().toISOString(),
            tableOfContents,
          };
        }

        // Default to HTML
        const htmlContent = enableMarkdownRendering
          ? await marked.parse(markdownContent)
          : markdownContent;
        reply.type('text/html');
        return wrapInHTMLTemplate(htmlContent, extractTitle(markdownContent));
      } catch (error: unknown) {
        const errorObj = error as { code?: string };
        if (errorObj.code === 'ENOENT') {
          return reply.status(404).send({
            success: false,
            error: 'GUIDE_NOT_FOUND',
            message: `Integration guide '${guide}' not found`,
          });
        } else {
          throw error;
        }
      }
    }
  );

  // Troubleshooting guides
  fastify.get(
    '/docs/troubleshooting/:guide',
    {
      schema: {
        tags: ['Documentation'],
        summary: 'Get troubleshooting guide',
        description: 'Retrieve troubleshooting documentation',
        params: {
          type: 'object',
          properties: {
            guide: {
              type: 'string',
              enum: ['common-issues', 'faq', 'error-codes', 'debugging'],
              description: 'Troubleshooting guide identifier',
            },
          },
          required: ['guide'],
        },
        querystring: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['markdown', 'html', 'json'],
              default: 'html',
              description: 'Response format',
            },
            search: {
              type: 'string',
              description: 'Search within the guide content',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { guide } = request.params as { guide: string };
      const { format = 'html', search } = request.query as {
        format?: string;
        search?: string;
      };

      try {
        const guidePath = join(docsPath, 'troubleshooting', `${guide}.md`);
        let markdownContent = await readFile(guidePath, 'utf-8');

        // Filter content based on search query
        if (search) {
          markdownContent = filterContentBySearch(markdownContent, search);
        }

        if (format === 'markdown') {
          reply.type('text/markdown');
          return markdownContent;
        }

        if (format === 'json') {
          const htmlContent = enableMarkdownRendering
            ? marked(markdownContent)
            : markdownContent;
          const tableOfContents = extractTableOfContents(markdownContent);
          const title = extractTitle(markdownContent);

          return {
            title,
            content: htmlContent,
            format: 'html',
            lastModified: new Date().toISOString(),
            tableOfContents,
            searchQuery: search,
          };
        }

        // Default to HTML
        const htmlContent = enableMarkdownRendering
          ? await marked.parse(markdownContent)
          : markdownContent;
        reply.type('text/html');
        return wrapInHTMLTemplate(htmlContent, extractTitle(markdownContent));
      } catch (error: unknown) {
        const errorObj = error as { code?: string };
        if (errorObj.code === 'ENOENT') {
          return reply.status(404).send({
            success: false,
            error: 'GUIDE_NOT_FOUND',
            message: `Troubleshooting guide '${guide}' not found`,
          });
        } else {
          throw error;
        }
      }
    }
  );

  // Search across all documentation
  fastify.get(
    '/docs/search',
    {
      schema: {
        tags: ['Documentation'],
        summary: 'Search documentation',
        description: 'Search across all documentation content',
        querystring: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              minLength: 2,
              description: 'Search query',
            },
            type: {
              type: 'string',
              enum: ['all', 'guides', 'troubleshooting', 'api'],
              default: 'all',
              description: 'Search scope',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 10,
              description: 'Maximum number of results',
            },
          },
          required: ['q'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    title: { type: 'string' },
                    url: { type: 'string' },
                    excerpt: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
              totalResults: { type: 'number' },
              searchTime: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const {
        q: query,
        type = 'all',
        limit = 10,
      } = request.query as {
        q: string;
        type?: string;
        limit?: number;
      };

      const startTime = Date.now();
      const results = await searchDocumentation(query, type, limit, docsPath);
      const searchTime = Date.now() - startTime;

      return {
        query,
        results,
        totalResults: results.length,
        searchTime,
      };
    }
  );

  // Documentation sitemap
  fastify.get(
    '/docs/sitemap',
    {
      schema: {
        tags: ['Documentation'],
        summary: 'Get documentation sitemap',
        description: 'Retrieve the complete documentation structure',
        response: {
          200: {
            type: 'object',
            properties: {
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          url: { type: 'string' },
                          description: { type: 'string' },
                          difficulty: { type: 'string' },
                          estimatedTime: { type: 'string' },
                          tags: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
              lastUpdated: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async () => {
      return {
        sections: [
          {
            name: 'Integration Guides',
            description: 'Step-by-step guides for integrating with the API',
            items: [
              {
                title: 'Quick Start Guide',
                url: '/docs/guides/quick-start',
                description:
                  'Get started with the Enterprise Authentication API in 5 minutes',
                difficulty: 'beginner',
                estimatedTime: '5 minutes',
                tags: ['authentication', 'getting-started'],
              },
              {
                title: 'OAuth2 Integration Guide',
                url: '/docs/guides/oauth-integration',
                description: 'Complete guide to integrating OAuth2 providers',
                difficulty: 'intermediate',
                estimatedTime: '30 minutes',
                tags: ['oauth', 'integration'],
              },
              {
                title: 'Multi-Factor Authentication Setup',
                url: '/docs/guides/mfa-setup',
                description: 'Implement MFA in your application',
                difficulty: 'intermediate',
                estimatedTime: '20 minutes',
                tags: ['mfa', 'security'],
              },
              {
                title: 'Passwordless Authentication',
                url: '/docs/guides/passwordless-auth',
                description: 'Implement WebAuthn and magic link authentication',
                difficulty: 'advanced',
                estimatedTime: '45 minutes',
                tags: ['passwordless', 'webauthn', 'security'],
              },
              {
                title: 'Webhook Integration',
                url: '/docs/guides/webhook-integration',
                description:
                  'Set up webhooks for real-time authentication events',
                difficulty: 'intermediate',
                estimatedTime: '25 minutes',
                tags: ['webhooks', 'events', 'real-time'],
              },
              {
                title: 'Enterprise Deployment Guide',
                url: '/docs/guides/enterprise-deployment',
                description:
                  'Deploy and scale the authentication system in production',
                difficulty: 'advanced',
                estimatedTime: '60 minutes',
                tags: ['deployment', 'scaling', 'production'],
              },
            ],
          },
          {
            name: 'Troubleshooting',
            description: 'Common issues and their solutions',
            items: [
              {
                title: 'Common Issues',
                url: '/docs/troubleshooting/common-issues',
                description: 'Solutions to frequently encountered problems',
                difficulty: 'all',
                estimatedTime: '10 minutes',
                tags: ['troubleshooting', 'errors', 'debugging'],
              },
              {
                title: 'Frequently Asked Questions',
                url: '/docs/troubleshooting/faq',
                description: 'Answers to common questions about the API',
                difficulty: 'all',
                estimatedTime: '15 minutes',
                tags: ['faq', 'questions', 'help'],
              },
            ],
          },
          {
            name: 'API Reference',
            description: 'Complete API documentation',
            items: [
              {
                title: 'Interactive API Documentation',
                url: '/docs',
                description: 'Swagger UI with interactive API explorer',
                difficulty: 'all',
                estimatedTime: 'varies',
                tags: ['api', 'reference', 'swagger'],
              },
              {
                title: 'OpenAPI Specification',
                url: '/docs/json',
                description: 'Machine-readable API specification',
                difficulty: 'advanced',
                estimatedTime: 'varies',
                tags: ['openapi', 'specification', 'json'],
              },
              {
                title: 'Postman Collection',
                url: '/docs/postman',
                description: 'Ready-to-use Postman collection for testing',
                difficulty: 'intermediate',
                estimatedTime: '5 minutes',
                tags: ['postman', 'testing', 'collection'],
              },
            ],
          },
          {
            name: 'SDKs and Examples',
            description: 'Client libraries and code examples',
            items: [
              {
                title: 'JavaScript SDK',
                url: '/docs/sdk/javascript',
                description: 'Full-featured JavaScript/TypeScript SDK',
                difficulty: 'beginner',
                estimatedTime: '5 minutes',
                tags: ['javascript', 'typescript', 'sdk'],
              },
              {
                title: 'Python SDK',
                url: '/docs/sdk/python',
                description: 'Complete Python SDK with async support',
                difficulty: 'beginner',
                estimatedTime: '5 minutes',
                tags: ['python', 'sdk', 'async'],
              },
              {
                title: 'cURL Examples',
                url: '/docs/sdk/curl',
                description: 'Command-line examples for all endpoints',
                difficulty: 'intermediate',
                estimatedTime: '10 minutes',
                tags: ['curl', 'cli', 'examples'],
              },
              {
                title: 'PHP SDK',
                url: '/docs/sdk/php',
                description: 'PHP SDK with Guzzle HTTP client support',
                difficulty: 'beginner',
                estimatedTime: '5 minutes',
                tags: ['php', 'sdk', 'guzzle'],
              },
            ],
          },
        ],
        lastUpdated: new Date().toISOString(),
      };
    }
  );
}

/**
 * Extract title from markdown content
 */
function extractTitle(markdown: string): string {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch && titleMatch[1] ? titleMatch[1] : 'Documentation';
}

/**
 * Extract table of contents from markdown
 */
function extractTableOfContents(
  markdown: string
): Array<{ level: number; title: string; anchor: string }> {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const toc: Array<{ level: number; title: string; anchor: string }> = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    if (match[1] && match[2]) {
      const level = match[1].length;
      const title = match[2];
      const anchor = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      toc.push({ level, title, anchor });
    }
  }

  return toc;
}

/**
 * Filter content based on search query
 */
function filterContentBySearch(content: string, query: string): string {
  const lines = content.split('\n');
  const searchTerms = query.toLowerCase().split(' ');
  const filteredLines: string[] = [];
  let inRelevantSection = false;
  let sectionBuffer: string[] = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const isHeading = line.match(/^#{1,6}\s/);
    const containsSearchTerm = searchTerms.some((term) =>
      lowerLine.includes(term)
    );

    if (isHeading) {
      // If we were in a relevant section, add the buffer
      if (inRelevantSection && sectionBuffer.length > 0) {
        filteredLines.push(...sectionBuffer);
      }

      // Start new section
      sectionBuffer = [line];
      inRelevantSection = containsSearchTerm;
    } else {
      sectionBuffer.push(line);
      if (containsSearchTerm) {
        inRelevantSection = true;
      }
    }
  }

  // Add the last section if relevant
  if (inRelevantSection && sectionBuffer.length > 0) {
    filteredLines.push(...sectionBuffer);
  }

  return filteredLines.length > 0 ? filteredLines.join('\n') : content;
}

/**
 * Search across documentation files
 */
async function searchDocumentation(
  query: string,
  type: string,
  limit: number,
  docsPath: string
): Promise<
  Array<{
    type: string;
    title: string;
    url: string;
    excerpt: string;
    score: number;
  }>
> {
  const results = [];
  const searchTerms = query.toLowerCase().split(' ');

  // Define search paths based on type
  const searchPaths = [];
  if (type === 'all' || type === 'guides') {
    searchPaths.push({
      path: 'integration-guides',
      urlPrefix: '/docs/guides',
      type: 'guide',
    });
  }
  if (type === 'all' || type === 'troubleshooting') {
    searchPaths.push({
      path: 'troubleshooting',
      urlPrefix: '/docs/troubleshooting',
      type: 'troubleshooting',
    });
  }

  for (const searchPath of searchPaths) {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(join(docsPath, searchPath.path));

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        try {
          const content = await readFile(
            join(docsPath, searchPath.path, file),
            'utf-8'
          );
          const title = extractTitle(content);
          const lowerContent = content.toLowerCase();

          // Calculate relevance score
          let score = 0;
          for (const term of searchTerms) {
            const titleMatches = (
              title.toLowerCase().match(new RegExp(term, 'g')) || []
            ).length;
            const contentMatches = (
              lowerContent.match(new RegExp(term, 'g')) || []
            ).length;
            score += titleMatches * 10 + contentMatches;
          }

          if (score > 0) {
            // Extract excerpt around first match
            const firstTerm = searchTerms[0];
            if (firstTerm) {
              const matchIndex = lowerContent.indexOf(firstTerm);
              const excerptStart = Math.max(0, matchIndex - 100);
              const excerptEnd = Math.min(content.length, matchIndex + 200);
              const excerpt = content.substring(excerptStart, excerptEnd).trim();

              results.push({
                type: searchPath.type,
                title,
                url: `${searchPath.urlPrefix}/${file.replace('.md', '')}`,
                excerpt: excerptStart > 0 ? '...' + excerpt : excerpt,
                score,
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    } catch (error) {
      // Skip directories that don't exist
      continue;
    }
  }

  // Sort by score and limit results
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Wrap content in HTML template
 */
function wrapInHTMLTemplate(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Enterprise Authentication API</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #2c3e50;
            margin-top: 2em;
        }
        h1 {
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        code {
            background: #f8f9fa;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border-left: 4px solid #3498db;
        }
        pre code {
            background: none;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #e74c3c;
            margin: 0;
            padding-left: 20px;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        a {
            color: #3498db;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .nav-links {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .nav-links a {
            margin-right: 15px;
        }
    </style>
</head>
<body>
    <div class="nav-links">
        <a href="/docs">← API Documentation</a>
        <a href="/docs/guides">Integration Guides</a>
        <a href="/docs/troubleshooting/common-issues">Troubleshooting</a>
        <a href="/docs/troubleshooting/faq">FAQ</a>
    </div>
    
    ${content}
    
    <hr style="margin: 40px 0;">
    <p style="text-align: center; color: #666; font-size: 14px;">
        <a href="/docs">Enterprise Authentication API Documentation</a> |
        <a href="/docs/guides">Integration Guides</a> |
        <a href="/docs/troubleshooting/faq">FAQ</a> |
        <a href="mailto:api-support@example.com">Support</a>
    </p>
</body>
</html>`;
}
