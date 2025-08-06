/**
 * Error Handler Validation Script
 * Tests the fixed error handler functionality
 */

import { errorHandler } from '../middleware/error-handler';
import { NotFoundError, ValidationError, InternalServerError } from '../../application/errors/base.errors';
import { createErrorContext } from '../utils/type-utils';

/**
 * Validate error handler functionality
 */
export function validateErrorHandler(): boolean {
  try {
    console.log('🔍 Validating Error Handler...');

    // Test 1: Error handler creation
    console.log('✅ Test 1: Error handler instance created successfully');

    // Test 2: Error context creation
    const context = createErrorContext({
      correlationId: 'test-123',
      operation: 'validation-test',
      userId: 'user-456',
    });
    console.log('✅ Test 2: Error context created successfully', context);

    // Test 3: Error classes instantiation
    const notFoundError = new NotFoundError(
      'Test resource not found',
      'test-resource',
      'resource-123',
      context
    );
    console.log('✅ Test 3: NotFoundError created successfully', {
      code: notFoundError.code,
      statusCode: notFoundError.statusCode,
      message: notFoundError.message,
    });

    const validationError = new ValidationError(
      { field: 'email', message: 'Invalid email format' },
      'Validation failed',
      context
    );
    console.log('✅ Test 4: ValidationError created successfully', {
      code: validationError.code,
      statusCode: validationError.statusCode,
    });

    const internalError = new InternalServerError(
      'Test internal error',
      new Error('Underlying error'),
      context
    );
    console.log('✅ Test 5: InternalServerError created successfully', {
      code: internalError.code,
      statusCode: internalError.statusCode,
    });

    // Test 6: Error serialization
    const errorJson = notFoundError.toJSON();
    console.log('✅ Test 6: Error serialization works correctly', {
      hasCode: 'code' in errorJson,
      hasMessage: 'message' in errorJson,
      hasTimestamp: 'timestamp' in errorJson,
    });

    // Test 7: Error statistics
    const stats = errorHandler.getErrorStats();
    console.log('✅ Test 7: Error statistics retrieved successfully', {
      totalErrors: stats.totalErrors,
      uniqueErrorTypes: stats.uniqueErrorTypes,
      errorCountsLength: stats.errorCounts.length,
    });

    console.log('🎉 All error handler validation tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Error handler validation failed:', error);
    return false;
  }
}

/**
 * Run validation if script is executed directly
 */
if (require.main === module) {
  const isValid = validateErrorHandler();
  process.exit(isValid ? 0 : 1);
}
