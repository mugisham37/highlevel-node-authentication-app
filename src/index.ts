import { createServer } from './infrastructure/server/fastify-server';
import { logger } from './infrastructure/logging/winston-logger';
import { config } from './infrastructure/config/environment';

let server: any = null;

async function bootstrap() {
  try {
    server = await createServer();

    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(
      `🚀 Server running on ${config.server.host}:${config.server.port}`
    );
    logger.info(
      `📚 API Documentation available at http://${config.server.host}:${config.server.port}/docs`
    );
    logger.info(
      `🔌 WebSocket server available at ws://${config.server.host}:${config.server.port}/ws/events`
    );
    logger.info(
      `⚖️ Load balancing and scaling endpoints available at /scaling/*`
    );
    logger.info(
      `🏥 Health check endpoints: /health/ready, /health/live, /health/startup`
    );
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Note: Graceful shutdown is now handled by the GracefulShutdownManager
// which is automatically initialized in the scaling system.
// The signal handlers are set up in the graceful-shutdown.ts module.

bootstrap();
