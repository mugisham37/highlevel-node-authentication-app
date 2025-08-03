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
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await gracefulShutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    if (server) {
      // Shutdown monitoring system first
      if (server.monitoringSystem) {
        await server.monitoringSystem.shutdown();
      }

      // Shutdown WebSocket server
      if (server.webSocketServer) {
        await server.webSocketServer.shutdown();
      }

      // Close HTTP server
      await server.close();
      logger.info('Server shutdown complete');
    }
  } catch (error) {
    logger.error('Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
}

bootstrap();
