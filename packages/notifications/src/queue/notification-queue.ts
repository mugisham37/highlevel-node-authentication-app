/**
 * Notification Queue System using Bull
 */

import { logger } from '@company/logger';
import Bull, { Job, JobOptions, Queue } from 'bull';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationJob {
  id: string;
  type: 'email' | 'sms' | 'push';
  recipient: string | string[];
  payload: any;
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: string | number;
  metadata?: Record<string, any>;
}

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions?: JobOptions;
}

export class NotificationQueue {
  private emailQueue: Queue;
  private smsQueue: Queue;
  private pushQueue: Queue;
  private redis: Redis;

  constructor(private config: QueueConfig) {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    const defaultOptions = {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      ...config.defaultJobOptions,
    };

    this.emailQueue = new Bull('email-notifications', {
      redis: config.redis,
      defaultJobOptions: defaultOptions,
    });

    this.smsQueue = new Bull('sms-notifications', {
      redis: config.redis,
      defaultJobOptions: defaultOptions,
    });

    this.pushQueue = new Bull('push-notifications', {
      redis: config.redis,
      defaultJobOptions: defaultOptions,
    });

    this.setupEventHandlers();
  }

  /**
   * Add email notification to queue
   */
  async addEmailJob(job: Omit<NotificationJob, 'type'>): Promise<Job> {
    const jobData: NotificationJob = {
      ...job,
      id: job.id || uuidv4(),
      type: 'email',
    };

    const options: JobOptions = {
      priority: job.priority || 0,
      delay: job.delay || 0,
      attempts: job.attempts || 3,
      backoff: job.backoff || 'exponential',
    };

    logger.debug('Adding email job to queue', {
      jobId: jobData.id,
      recipient: jobData.recipient,
      priority: options.priority,
    });

    return this.emailQueue.add('send-email', jobData, options);
  }

  /**
   * Add SMS notification to queue
   */
  async addSMSJob(job: Omit<NotificationJob, 'type'>): Promise<Job> {
    const jobData: NotificationJob = {
      ...job,
      id: job.id || uuidv4(),
      type: 'sms',
    };

    const options: JobOptions = {
      priority: job.priority || 0,
      delay: job.delay || 0,
      attempts: job.attempts || 3,
      backoff: job.backoff || 'exponential',
    };

    logger.debug('Adding SMS job to queue', {
      jobId: jobData.id,
      recipient: jobData.recipient,
      priority: options.priority,
    });

    return this.smsQueue.add('send-sms', jobData, options);
  }

  /**
   * Add push notification to queue
   */
  async addPushJob(job: Omit<NotificationJob, 'type'>): Promise<Job> {
    const jobData: NotificationJob = {
      ...job,
      id: job.id || uuidv4(),
      type: 'push',
    };

    const options: JobOptions = {
      priority: job.priority || 0,
      delay: job.delay || 0,
      attempts: job.attempts || 3,
      backoff: job.backoff || 'exponential',
    };

    logger.debug('Adding push job to queue', {
      jobId: jobData.id,
      recipient: jobData.recipient,
      priority: options.priority,
    });

    return this.pushQueue.add('send-push', jobData, options);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [emailStats, smsStats, pushStats] = await Promise.all([
      this.getQueueStatistics(this.emailQueue),
      this.getQueueStatistics(this.smsQueue),
      this.getQueueStatistics(this.pushQueue),
    ]);

    return {
      email: emailStats,
      sms: smsStats,
      push: pushStats,
    };
  }

  /**
   * Get statistics for a specific queue
   */
  private async getQueueStatistics(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Pause all queues
   */
  async pauseAll(): Promise<void> {
    await Promise.all([
      this.emailQueue.pause(),
      this.smsQueue.pause(),
      this.pushQueue.pause(),
    ]);

    logger.info('All notification queues paused');
  }

  /**
   * Resume all queues
   */
  async resumeAll(): Promise<void> {
    await Promise.all([
      this.emailQueue.resume(),
      this.smsQueue.resume(),
      this.pushQueue.resume(),
    ]);

    logger.info('All notification queues resumed');
  }

  /**
   * Clean completed and failed jobs
   */
  async cleanQueues(): Promise<void> {
    const cleanOptions = {
      grace: 1000,
      limit: 100,
    };

    await Promise.all([
      this.emailQueue.clean(24 * 60 * 60 * 1000, 'completed', cleanOptions.limit),
      this.emailQueue.clean(24 * 60 * 60 * 1000, 'failed', cleanOptions.limit),
      this.smsQueue.clean(24 * 60 * 60 * 1000, 'completed', cleanOptions.limit),
      this.smsQueue.clean(24 * 60 * 60 * 1000, 'failed', cleanOptions.limit),
      this.pushQueue.clean(24 * 60 * 60 * 1000, 'completed', cleanOptions.limit),
      this.pushQueue.clean(24 * 60 * 60 * 1000, 'failed', cleanOptions.limit),
    ]);

    logger.info('Notification queues cleaned');
  }

  /**
   * Close all queues and Redis connection
   */
  async close(): Promise<void> {
    await Promise.all([
      this.emailQueue.close(),
      this.smsQueue.close(),
      this.pushQueue.close(),
    ]);

    await this.redis.disconnect();
    logger.info('Notification queues closed');
  }

  /**
   * Get queue instances for external processors
   */
  getQueues() {
    return {
      email: this.emailQueue,
      sms: this.smsQueue,
      push: this.pushQueue,
    };
  }

  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers(): void {
    const queues = [
      { name: 'email', queue: this.emailQueue },
      { name: 'sms', queue: this.smsQueue },
      { name: 'push', queue: this.pushQueue },
    ];

    queues.forEach(({ name, queue }) => {
      queue.on('completed', (job: Job) => {
        logger.info(`${name} notification job completed`, {
          jobId: job.id,
          duration: Date.now() - job.processedOn!,
        });
      });

      queue.on('failed', (job: Job, err: Error) => {
        logger.error(`${name} notification job failed`, {
          jobId: job.id,
          error: err.message,
          attempts: job.attemptsMade,
          data: job.data,
        });
      });

      queue.on('stalled', (job: Job) => {
        logger.warn(`${name} notification job stalled`, {
          jobId: job.id,
          data: job.data,
        });
      });

      queue.on('progress', (job: Job, progress: number) => {
        logger.debug(`${name} notification job progress`, {
          jobId: job.id,
          progress,
        });
      });
    });
  }
}