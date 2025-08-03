import { createServer } from './infrastructure/server/fastify-server';
import { logger } from './infrastructure/logging/winston-logger';
import { config } from './infrastructure/config/environment';

async function bootstrap() {
  try {
    const server = await createServer();
    
    await server.listen({
      port: config.server.port,
      host: config.server.host
    });

    logger.info(`🚀 Server running on ${config.server.host}:${config.server.port}`);
    logger.info(`📚 API Documentation available at http://${config.server.host}:${config.server.port}/docs`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

bootstrap();