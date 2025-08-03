/**
 * Resilience System Exports
 * Central export point for all resilience and error handling components
 */

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitBreakerState,
  CircuitBreakerOptions,
  CircuitBreakerStats,
  circuitBreakerManager,
} from './circuit-breaker';

// Retry Mechanism
export {
  RetryManager,
  RetryOptions,
  RetryResult,
  RetryUtils,
  retry,
} from './retry';

// Graceful Degradation
export {
  GracefulDegradationManager,
  DegradationOptions,
  FallbackStrategy,
  DegradationState,
  DegradationStrategies,
  degradationManagers,
} from './graceful-degradation';

// Error Handling
export * from '../../application/errors/base.errors';

// Tracing and Correlation
export {
  correlationIdManager,
  CorrelationContext,
  TraceSpan,
  TraceLog,
  CorrelationUtils,
  trace,
  createCorrelationMiddleware,
} from '../tracing/correlation-id';

// Health Checks
export {
  healthCheckManager,
  HealthCheck,
  HealthCheckManager,
  HealthCheckResult,
  SystemHealthStatus,
  HealthCheckOptions,
  CommonHealthChecks,
} from '../health/health-check';

// Error Handler Middleware
export {
  ErrorHandler,
  ErrorResponse,
  ErrorHandlerOptions,
  errorHandler,
} from '../middleware/error-handler';
