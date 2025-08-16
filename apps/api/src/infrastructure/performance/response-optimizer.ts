/**
 * Response Optimization System with Compression and Performance Enhancements
 * Provides intelligent response optimization, compression, and caching strategies
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { performanceTracker } from '../monitoring/performance-tracker';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { createHash } from 'crypto';
import { gzip, deflate, brotliCompress } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);
const brotliCompressAsync = promisify(brotliCompress);

export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // Minimum response size to compress (bytes)
  level: number; // Compression level (1-9)
  algorithms: ('gzip' | 'deflate' | 'br')[];
  mimeTypes: string[];
  excludePatterns: RegExp[];
}

export interface CacheConfig {
  enabled: boolean;
  defaultTTL: number; // Seconds
  maxAge: number; // Seconds
  staleWhileRevalidate: number; // Seconds
  varyHeaders: string[];
  excludePatterns: RegExp[];
  privateRoutes: RegExp[];
}

export interface OptimizationConfig {
  compression: CompressionConfig;
  cache: CacheConfig;
  etag: {
    enabled: boolean;
    weak: boolean;
  };
  minification: {
    enabled: boolean;
    json: boolean;
    html: boolean;
  };
  streaming: {
    enabled: boolean;
    threshold: number; // Bytes
  };
}

export interface ResponseMetrics {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  algorithm: string;
  cacheHit: boolean;
  etagMatch: boolean;
  processingTime: number;
}

export class ResponseOptimizer {
  private responseCache = new Map<string, CachedResponse>();
  private etagCache = new Map<string, string>();
  private compressionCache = new Map<string, CompressedResponse>();

  constructor(private config: OptimizationConfig) {
    this.startCacheCleanup();
  }

  /**
   * Optimize response middleware
   */
  async optimizeResponse(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: any
  ): Promise<any> {
    const metricId = performanceTracker.startTracking(
      'response_optimization',
      'response_optimizer',
      {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent']?.substring(0, 100),
      }
    );

    try {
      const startTime = Date.now();
      let optimizedPayload = payload;
      const metrics: Partial<ResponseMetrics> = {
        originalSize: this.getPayloadSize(payload),
        cacheHit: false,
        etagMatch: false,
        processingTime: 0,
      };

      // Check if response should be cached
      if (this.shouldCache(request)) {
        const cacheKey = this.generateCacheKey(request);
        const cached = await this.getCachedResponse(cacheKey);

        if (cached && !this.isCacheExpired(cached)) {
          metrics.cacheHit = true;
          this.setCacheHeaders(reply, cached);

          performanceTracker.stopTracking(metricId, 'success', undefined, {
            source: 'cache',
            cacheKey,
          });

          metricsManager.recordCacheOperation(
            'get',
            'memory',
            'hit',
            Date.now() - startTime
          );
          return cached.data;
        }
      }

      // Handle ETag validation
      if (this.config.etag.enabled) {
        const etag = this.generateETag(payload);
        const clientETag = request.headers['if-none-match'];

        if (clientETag === etag) {
          metrics.etagMatch = true;
          reply.code(304);

          performanceTracker.stopTracking(metricId, 'success', undefined, {
            source: 'etag',
            etag,
          });

          return '';
        }

        reply.header('ETag', etag);
      }

      // Minify response if enabled
      if (this.config.minification.enabled) {
        optimizedPayload = await this.minifyResponse(optimizedPayload, reply);
      }

      // Compress response if applicable
      if (this.shouldCompress(request, reply, optimizedPayload)) {
        const compressionResult = await this.compressResponse(
          request,
          reply,
          optimizedPayload
        );

        if (compressionResult) {
          optimizedPayload = compressionResult.data;
          metrics.compressedSize = compressionResult.size;
          metrics.compressionRatio = compressionResult.ratio;
          metrics.compressionTime = compressionResult.time;
          metrics.algorithm = compressionResult.algorithm;
        }
      }

      // Set optimization headers
      this.setOptimizationHeaders(reply, metrics);

      // Cache the response if applicable
      if (this.shouldCache(request)) {
        const cacheKey = this.generateCacheKey(request);
        await this.cacheResponse(cacheKey, optimizedPayload, reply);
      }

      metrics.processingTime = Date.now() - startTime;

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        metrics,
        optimizationApplied: true,
      });

      // Record metrics
      this.recordOptimizationMetrics(
        request,
        reply,
        metrics as ResponseMetrics
      );

      return optimizedPayload;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      logger.error('Response optimization failed', {
        error: (error as Error).message,
        method: request.method,
        url: request.url,
        correlationId: correlationIdManager.getCorrelationId(),
      });

      // Return original payload on optimization failure
      return payload;
    }
  }

  /**
   * Check if response should be compressed
   */
  private shouldCompress(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: any
  ): boolean {
    if (!this.config.compression.enabled) {
      return false;
    }

    // Check size threshold
    const size = this.getPayloadSize(payload);
    if (size < this.config.compression.threshold) {
      return false;
    }

    // Check accept-encoding header
    const acceptEncoding = request.headers['accept-encoding'] || '';
    const supportedAlgorithms = this.config.compression.algorithms.filter(
      (alg) => acceptEncoding.includes(alg)
    );

    if (supportedAlgorithms.length === 0) {
      return false;
    }

    // Check content type
    const contentType = (reply.getHeader('content-type') as string) || '';
    const shouldCompressMimeType = this.config.compression.mimeTypes.some(
      (mimeType) => contentType.includes(mimeType)
    );

    if (!shouldCompressMimeType) {
      return false;
    }

    // Check exclude patterns
    const url = request.url;
    const shouldExclude = this.config.compression.excludePatterns.some(
      (pattern) => pattern.test(url)
    );

    return !shouldExclude;
  }

  /**
   * Compress response data
   */
  private async compressResponse(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: any
  ): Promise<CompressedResponse | null> {
    const acceptEncoding = request.headers['accept-encoding'] || '';
    const data = this.serializePayload(payload);
    const originalSize = Buffer.byteLength(data);

    // Check compression cache
    const cacheKey = this.generateCompressionCacheKey(data);
    const cached = this.compressionCache.get(cacheKey);
    if (cached) {
      reply.header('Content-Encoding', cached.algorithm);
      return cached;
    }

    const startTime = Date.now();
    let compressedData: Buffer;
    let algorithm: string = 'none';

    try {
      // Select best compression algorithm
      if (
        acceptEncoding.includes('br') &&
        this.config.compression.algorithms.includes('br')
      ) {
        compressedData = await brotliCompressAsync(Buffer.from(data));
        algorithm = 'br';
      } else if (
        acceptEncoding.includes('gzip') &&
        this.config.compression.algorithms.includes('gzip')
      ) {
        compressedData = await gzipAsync(Buffer.from(data), {
          level: this.config.compression.level,
        });
        algorithm = 'gzip';
      } else if (
        acceptEncoding.includes('deflate') &&
        this.config.compression.algorithms.includes('deflate')
      ) {
        compressedData = await deflateAsync(Buffer.from(data), {
          level: this.config.compression.level,
        });
        algorithm = 'deflate';
      } else {
        return null;
      }

      const compressedSize = compressedData.length;
      const compressionRatio = originalSize / compressedSize;
      const compressionTime = Date.now() - startTime;

      // Only use compression if it provides significant benefit
      if (compressionRatio < 1.1) {
        return null;
      }

      const result: CompressedResponse = {
        data: compressedData,
        size: compressedSize,
        ratio: compressionRatio,
        time: compressionTime,
        algorithm,
      };

      // Cache compression result
      this.compressionCache.set(cacheKey, result);

      // Set headers
      reply.header('Content-Encoding', algorithm);
      reply.header('Content-Length', compressedSize);

      logger.debug('Response compressed successfully', {
        algorithm,
        originalSize,
        compressedSize,
        compressionRatio: compressionRatio.toFixed(2),
        compressionTime,
        url: request.url,
      });

      return result;
    } catch (error) {
      logger.error('Compression failed', {
        error: (error as Error).message,
        algorithm,
        originalSize,
        url: request.url,
      });
      return null;
    }
  }

  /**
   * Check if response should be cached
   */
  private shouldCache(request: FastifyRequest): boolean {
    if (!this.config.cache.enabled) {
      return false;
    }

    // Only cache GET requests
    if (request.method !== 'GET') {
      return false;
    }

    // Check exclude patterns
    const url = request.url;
    const shouldExclude = this.config.cache.excludePatterns.some((pattern) =>
      pattern.test(url)
    );

    if (shouldExclude) {
      return false;
    }

    // Check if it's a private route
    const isPrivate = this.config.cache.privateRoutes.some((pattern) =>
      pattern.test(url)
    );

    // Don't cache private routes with authentication
    if (isPrivate && request.headers.authorization) {
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: FastifyRequest): string {
    const keyData = {
      method: request.method,
      url: request.url,
      query: request.query,
      vary: this.config.cache.varyHeaders.reduce(
        (acc, header) => {
          acc[header] = request.headers[header.toLowerCase()];
          return acc;
        },
        {} as Record<string, any>
      ),
    };

    return createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Generate compression cache key
   */
  private generateCompressionCacheKey(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Generate ETag for payload
   */
  private generateETag(payload: any): string {
    const data = this.serializePayload(payload);
    const hash = createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 16);
    return this.config.etag.weak ? `W/"${hash}"` : `"${hash}"`;
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(
    cacheKey: string
  ): Promise<CachedResponse | null> {
    return this.responseCache.get(cacheKey) || null;
  }

  /**
   * Cache response
   */
  private async cacheResponse(
    cacheKey: string,
    data: any,
    reply: FastifyReply
  ): Promise<void> {
    const cached: CachedResponse = {
      data,
      timestamp: Date.now(),
      ttl: this.config.cache.defaultTTL * 1000, // Convert to milliseconds
      headers: {
        'content-type': reply.getHeader('content-type') as string,
        'content-encoding': reply.getHeader('content-encoding') as string,
        etag: reply.getHeader('etag') as string,
      },
    };

    this.responseCache.set(cacheKey, cached);
  }

  /**
   * Check if cached response is expired
   */
  private isCacheExpired(cached: CachedResponse): boolean {
    return Date.now() - cached.timestamp > cached.ttl;
  }

  /**
   * Set cache headers
   */
  private setCacheHeaders(reply: FastifyReply, cached: CachedResponse): void {
    const age = Math.floor((Date.now() - cached.timestamp) / 1000);
    const maxAge = Math.floor(cached.ttl / 1000);

    reply.header('Cache-Control', `public, max-age=${maxAge}`);
    reply.header('Age', age.toString());

    if (cached.headers['content-type']) {
      reply.header('Content-Type', cached.headers['content-type']);
    }

    if (cached.headers['content-encoding']) {
      reply.header('Content-Encoding', cached.headers['content-encoding']);
    }

    if (cached.headers['etag']) {
      reply.header('ETag', cached.headers['etag']);
    }
  }

  /**
   * Set optimization headers
   */
  private setOptimizationHeaders(
    reply: FastifyReply,
    metrics: Partial<ResponseMetrics>
  ): void {
    // Add custom headers for debugging/monitoring
    if (metrics.compressionRatio) {
      reply.header('X-Compression-Ratio', metrics.compressionRatio.toFixed(2));
    }

    if (metrics.processingTime) {
      reply.header('X-Processing-Time', `${metrics.processingTime}ms`);
    }

    if (metrics.cacheHit) {
      reply.header('X-Cache', 'HIT');
    } else {
      reply.header('X-Cache', 'MISS');
    }

    // Set standard cache control headers
    if (this.config.cache.enabled) {
      reply.header(
        'Cache-Control',
        `public, max-age=${this.config.cache.maxAge}`
      );
    }
  }

  /**
   * Minify response based on content type
   */
  private async minifyResponse(
    payload: any,
    reply: FastifyReply
  ): Promise<any> {
    const contentType = (reply.getHeader('content-type') as string) || '';

    if (
      this.config.minification.json &&
      contentType.includes('application/json')
    ) {
      return this.minifyJSON(payload);
    }

    if (this.config.minification.html && contentType.includes('text/html')) {
      return this.minifyHTML(payload);
    }

    return payload;
  }

  /**
   * Minify JSON response
   */
  private minifyJSON(payload: any): any {
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        return JSON.stringify(parsed); // This removes extra whitespace
      } catch {
        return payload;
      }
    }
    return payload;
  }

  /**
   * Minify HTML response
   */
  private minifyHTML(payload: any): any {
    if (typeof payload === 'string') {
      return payload
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .replace(/>\s+</g, '><') // Remove whitespace between tags
        .trim();
    }
    return payload;
  }

  /**
   * Serialize payload to string
   */
  private serializePayload(payload: any): string {
    if (typeof payload === 'string') {
      return payload;
    }

    if (Buffer.isBuffer(payload)) {
      return payload.toString();
    }

    return JSON.stringify(payload);
  }

  /**
   * Get payload size in bytes
   */
  private getPayloadSize(payload: any): number {
    const serialized = this.serializePayload(payload);
    return Buffer.byteLength(serialized, 'utf8');
  }

  /**
   * Record optimization metrics
   */
  private recordOptimizationMetrics(
    request: FastifyRequest,
    reply: FastifyReply,
    metrics: ResponseMetrics
  ): void {
    // Record response size metrics
    metricsManager.apiMetrics.httpResponseSize.observe(
      {
        method: request.method,
        route: this.extractRoute(request.url),
        status_code: reply.statusCode.toString(),
      },
      metrics.compressedSize || metrics.originalSize
    );

    // Record compression metrics if compression was applied
    if (metrics.compressionRatio > 1) {
      logger.info('Response compression metrics', {
        url: request.url,
        method: request.method,
        originalSize: metrics.originalSize,
        compressedSize: metrics.compressedSize,
        compressionRatio: metrics.compressionRatio,
        algorithm: metrics.algorithm,
        compressionTime: metrics.compressionTime,
        correlationId: correlationIdManager.getCorrelationId(),
      });
    }

    // Record cache metrics
    if (metrics.cacheHit) {
      metricsManager.recordCacheOperation('get', 'memory', 'hit', 0);
    }
  }

  /**
   * Extract route pattern from URL
   */
  private extractRoute(url: string | undefined): string {
    // Simple route extraction - in a real implementation,
    // this would use the router's route matching logic
    if (!url) return '/unknown';
    const baseUrl = url.split('?')[0];
    if (!baseUrl) return '/unknown';
    return baseUrl.replace(/\/\d+/g, '/:id');
  }

  /**
   * Start cache cleanup process
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCaches();
    }, 300000); // Every 5 minutes
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCaches(): void {
    const now = Date.now();
    let cleanedResponses = 0;
    let cleanedCompressions = 0;

    // Clean response cache
    for (const [key, cached] of this.responseCache.entries()) {
      if (this.isCacheExpired(cached)) {
        this.responseCache.delete(key);
        cleanedResponses++;
      }
    }

    // Clean compression cache (keep for 1 hour)
    const compressionTTL = 3600000; // 1 hour
    for (const [key, cached] of this.compressionCache.entries()) {
      if (now - cached.time > compressionTTL) {
        this.compressionCache.delete(key);
        cleanedCompressions++;
      }
    }

    if (cleanedResponses > 0 || cleanedCompressions > 0) {
      logger.debug('Cache cleanup completed', {
        cleanedResponses,
        cleanedCompressions,
        remainingResponses: this.responseCache.size,
        remainingCompressions: this.compressionCache.size,
      });
    }
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    return {
      responseCacheSize: this.responseCache.size,
      compressionCacheSize: this.compressionCache.size,
      etagCacheSize: this.etagCache.size,
      config: this.config,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.responseCache.clear();
    this.compressionCache.clear();
    this.etagCache.clear();

    logger.info('All response optimization caches cleared');
  }
}

interface CachedResponse {
  data: any;
  timestamp: number;
  ttl: number;
  headers: Record<string, string>;
}

interface CompressedResponse {
  data: Buffer;
  size: number;
  ratio: number;
  time: number;
  algorithm: string;
}

// Default configuration
export const defaultOptimizationConfig: OptimizationConfig = {
  compression: {
    enabled: true,
    threshold: 1024, // 1KB
    level: 6,
    algorithms: ['br', 'gzip', 'deflate'],
    mimeTypes: [
      'application/json',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'text/xml',
      'application/xml',
      'text/plain',
    ],
    excludePatterns: [
      /\.(jpg|jpeg|png|gif|webp|ico|svg)$/i,
      /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i,
      /\.(zip|rar|7z|tar|gz)$/i,
    ],
  },
  cache: {
    enabled: true,
    defaultTTL: 300, // 5 minutes
    maxAge: 3600, // 1 hour
    staleWhileRevalidate: 86400, // 24 hours
    varyHeaders: ['Accept-Encoding', 'Accept-Language'],
    excludePatterns: [/^\/api\/auth\//, /^\/api\/admin\//, /\?.*$/],
    privateRoutes: [/^\/api\/user\//, /^\/api\/profile\//],
  },
  etag: {
    enabled: true,
    weak: false,
  },
  minification: {
    enabled: true,
    json: true,
    html: true,
  },
  streaming: {
    enabled: true,
    threshold: 1048576, // 1MB
  },
};
