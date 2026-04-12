import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const register = new Registry();
register.setDefaultLabels({ service: 'worker' });
collectDefaultMetrics({ register });

// ─── Business metrics ──────────────────────────────────────────────────────

export const leadsCreatedTotal = new Counter({
  name: 'leads_created_total',
  help: 'Total leads created from landing pages',
  labelNames: ['meta_pixel_id'],
  registers: [register],
});

export const leadsMatchedTotal = new Counter({
  name: 'leads_matched_total',
  help: 'Lead code-to-phone matching attempts by result',
  labelNames: ['result'],
  registers: [register],
});

export const leadsConvertedTotal = new Counter({
  name: 'leads_converted_total',
  help: 'Total leads converted by cashiers',
  labelNames: ['meta_pixel_id'],
  registers: [register],
});

export const leadConversionAmountArs = new Histogram({
  name: 'lead_conversion_amount_ars',
  help: 'Converted lead amounts in ARS',
  labelNames: ['meta_pixel_id'],
  buckets: [1000, 2500, 5000, 10000, 25000, 50000, 100000],
  registers: [register],
});

export const metaConversionEventsTotal = new Counter({
  name: 'meta_conversion_events_total',
  help: 'Meta Pixel Conversion API calls by event type and result',
  labelNames: ['event_type', 'result'],
  registers: [register],
});

export const metaConversionDurationSeconds = new Histogram({
  name: 'meta_conversion_duration_seconds',
  help: 'Meta Conversion API call duration in seconds',
  labelNames: ['event_type'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// ─── Technical metrics ─────────────────────────────────────────────────────

export const leadCodeCollisionsTotal = new Counter({
  name: 'lead_code_collisions_total',
  help: 'Lead code generation unique constraint collisions',
  registers: [register],
});

export const bullmqJobsTotal = new Counter({
  name: 'bullmq_jobs_total',
  help: 'BullMQ inbound jobs processed by result and event type',
  labelNames: ['result', 'event_type'],
  registers: [register],
});

export const bullmqJobDurationSeconds = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ inbound job processing duration in seconds',
  labelNames: ['event_type'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});
