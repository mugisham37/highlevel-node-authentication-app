import { deflateSync, gunzipSync, gzipSync, inflateSync } from 'zlib';

/**
 * Compression interface
 */
export interface CompressionProvider {
  name: string;
  compress(data: Buffer): Buffer;
  decompress(data: Buffer): Buffer;
  getCompressionRatio(original: Buffer, compressed: Buffer): number;
}

/**
 * GZIP compression provider
 */
export class GzipCompressionProvider implements CompressionProvider {
  name = 'gzip';

  compress(data: Buffer): Buffer {
    return gzipSync(data);
  }

  decompress(data: Buffer): Buffer {
    return gunzipSync(data);
  }

  getCompressionRatio(original: Buffer, compressed: Buffer): number {
    return compressed.length / original.length;
  }
}

/**
 * Deflate compression provider
 */
export class DeflateCompressionProvider implements CompressionProvider {
  name = 'deflate';

  compress(data: Buffer): Buffer {
    return deflateSync(data);
  }

  decompress(data: Buffer): Buffer {
    return inflateSync(data);
  }

  getCompressionRatio(original: Buffer, compressed: Buffer): number {
    return compressed.length / original.length;
  }
}

/**
 * Compression manager
 */
export class CompressionManager {
  private providers: Map<string, CompressionProvider> = new Map();
  private defaultProvider: CompressionProvider;
  private compressionThreshold: number;

  constructor(compressionThreshold: number = 1024) {
    this.compressionThreshold = compressionThreshold;
    
    // Register default providers
    this.registerProvider(new GzipCompressionProvider());
    this.registerProvider(new DeflateCompressionProvider());
    
    this.defaultProvider = new GzipCompressionProvider();
  }

  registerProvider(provider: CompressionProvider): void {
    this.providers.set(provider.name, provider);
  }

  shouldCompress(data: Buffer): boolean {
    return data.length > this.compressionThreshold;
  }

  compress(data: Buffer, providerName?: string): Buffer {
    if (!this.shouldCompress(data)) {
      return data;
    }

    const provider = providerName 
      ? this.providers.get(providerName) || this.defaultProvider
      : this.defaultProvider;

    const compressed = provider.compress(data);
    
    // Add header to identify compression method
    const header = Buffer.from(`COMP:${provider.name}:`);
    return Buffer.concat([header, compressed]);
  }

  decompress(data: Buffer): Buffer {
    // Check if data is compressed
    const headerMatch = data.toString('utf8', 0, 20).match(/^COMP:(\w+):/);
    
    if (!headerMatch) {
      return data; // Not compressed
    }

    const providerName = headerMatch[1];
    const headerLength = headerMatch[0].length;
    const compressedData = data.subarray(headerLength);

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown compression provider: ${providerName}`);
    }

    return provider.decompress(compressedData);
  }
}