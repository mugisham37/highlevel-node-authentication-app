/**
 * Cache partitioning strategies for distributing data across multiple cache instances
 */

export interface PartitioningStrategy {
  name: string;
  getPartition(key: string, partitionCount: number): number;
}

/**
 * Hash-based partitioning strategy
 */
export class HashPartitioningStrategy implements PartitioningStrategy {
  name = 'hash';

  getPartition(key: string, partitionCount: number): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % partitionCount;
  }
}

/**
 * Consistent hashing partitioning strategy
 */
export class ConsistentHashPartitioningStrategy implements PartitioningStrategy {
  name = 'consistent-hash';
  private virtualNodes: number;

  constructor(virtualNodes: number = 150) {
    this.virtualNodes = virtualNodes;
  }

  getPartition(key: string, partitionCount: number): number {
    // Simplified consistent hashing implementation
    const hash = this.hash(key);
    const virtualNodeHash = hash % (partitionCount * this.virtualNodes);
    return Math.floor(virtualNodeHash / this.virtualNodes);
  }

  private hash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

/**
 * Range-based partitioning strategy
 */
export class RangePartitioningStrategy implements PartitioningStrategy {
  name = 'range';

  getPartition(key: string, partitionCount: number): number {
    // Use first character for simple range partitioning
    const firstChar = key.charCodeAt(0);
    const rangeSize = Math.ceil(256 / partitionCount);
    return Math.min(Math.floor(firstChar / rangeSize), partitionCount - 1);
  }
}

/**
 * Partitioning manager
 */
export class PartitioningManager {
  private strategies: Map<string, PartitioningStrategy> = new Map();
  private defaultStrategy: PartitioningStrategy;

  constructor() {
    this.registerStrategy(new HashPartitioningStrategy());
    this.registerStrategy(new ConsistentHashPartitioningStrategy());
    this.registerStrategy(new RangePartitioningStrategy());
    
    this.defaultStrategy = new HashPartitioningStrategy();
  }

  registerStrategy(strategy: PartitioningStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  getPartition(
    key: string, 
    partitionCount: number, 
    strategyName?: string
  ): number {
    const strategy = strategyName 
      ? this.strategies.get(strategyName) || this.defaultStrategy
      : this.defaultStrategy;

    return strategy.getPartition(key, partitionCount);
  }
}