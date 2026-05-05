import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const register = new Registry();
register.setDefaultLabels({ service: 'gateway' });
collectDefaultMetrics({ register });

export const webhooksEnqueuedTotal = new Counter({
  name: 'webhooks_enqueued_total',
  help: 'Total webhooks successfully enqueued to BullMQ',
  labelNames: ['event_type'],
  registers: [register],
});

export const webhooksRejectedTotal = new Counter({
  name: 'webhooks_rejected_total',
  help: 'Total webhooks rejected before queuing',
  labelNames: ['reason'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});
