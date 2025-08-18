import { gunzipSync, gzipSync } from 'zlib';

/**
 * Cache serializer interface
 */
export interface CacheSerializer {
  name: string;
  serialize(data: any): string | Buffer;
  deserialize(data: string | Buffer): any;
  shouldCompress?(data: any): boolean;
}

/**
 * JSON serializer with optional compression
 */
export class JSONSerializer implements CacheSerializer {
  name = 'json';
  private compressionThreshold: number;

  constructor(compressionThreshold: number = 1024) {
    this.compressionThreshold = compressionThreshold;
  }

  serialize(data: any): string | Buffer {
    const jsonString = JSON.stringify(data);
    
    if (this.shouldCompress(jsonString)) {
      const compressed = gzipSync(Buffer.from(jsonString, 'utf8'));
      return Buffer.concat([Buffer.from('GZIP'), compressed]);
    }
    
    return jsonString;
  }

  deserialize(data: string | Buffer): any {
    if (Buffer.isBuffer(data)) {
      // Check if it's compressed
      if (data.subarray(0, 4).toString() === 'GZIP') {
        const compressed = data.subarray(4);
        const decompressed = gunzipSync(compressed);
        return JSON.parse(decompressed.toString('utf8'));
      }
      data = data.toString('utf8');
    }
    
    return JSON.parse(data);
  }

  shouldCompress(data: string): boolean {
    return Buffer.byteLength(data, 'utf8') > this.compressionThreshold;
  }
}

/**
 * Binary serializer for Buffer data
 */
export class BinarySerializer implements CacheSerializer {
  name = 'binary';

  serialize(data: any): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }
    
    if (typeof data === 'string') {
      return Buffer.from(data, 'utf8');
    }
    
    // Convert to JSON first, then to buffer
    return Buffer.from(JSON.stringify(data), 'utf8');
  }

  deserialize(data: string | Buffer): any {
    if (typeof data === 'string') {
      return data;
    }
    
    return data;
  }
}

/**
 * MessagePack serializer (placeholder - would need msgpack library)
 */
export class MessagePackSerializer implements CacheSerializer {
  name = 'messagepack';

  serialize(data: any): Buffer {
    // Placeholder implementation - would use msgpack.encode(data)
    return Buffer.from(JSON.stringify(data), 'utf8');
  }

  deserialize(data: string | Buffer): any {
    // Placeholder implementation - would use msgpack.decode(data)
    if (Buffer.isBuffer(data)) {
      return JSON.parse(data.toString('utf8'));
    }
    return JSON.parse(data);
  }
}/**
 
* Serializer manager for handling different data types
 */
export class SerializerManager {
  private serializers: Map<string, CacheSerializer> = new Map();
  private defaultSerializer: CacheSerializer;

  constructor() {
    // Register default serializers
    this.registerSerializer(new JSONSerializer());
    this.registerSerializer(new BinarySerializer());
    this.registerSerializer(new MessagePackSerializer());
    
    this.defaultSerializer = new JSONSerializer();
  }

  registerSerializer(serializer: CacheSerializer): void {
    this.serializers.set(serializer.name, serializer);
  }

  getSerializer(name: string): CacheSerializer {
    const serializer = this.serializers.get(name);
    if (!serializer) {
      throw new Error(`Unknown serializer: ${name}`);
    }
    return serializer;
  }

  serialize(data: any, serializerName?: string): string | Buffer {
    const serializer = serializerName 
      ? this.getSerializer(serializerName)
      : this.defaultSerializer;
    
    return serializer.serialize(data);
  }

  deserialize(data: string | Buffer, serializerName?: string): any {
    const serializer = serializerName 
      ? this.getSerializer(serializerName)
      : this.defaultSerializer;
    
    return serializer.deserialize(data);
  }

  setDefaultSerializer(name: string): void {
    this.defaultSerializer = this.getSerializer(name);
  }

  listSerializers(): string[] {
    return Array.from(this.serializers.keys());
  }
}