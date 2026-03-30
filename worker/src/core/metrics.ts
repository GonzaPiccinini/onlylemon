import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const jobsProcessedTotal = new Counter({
  name: 'jobs_processed_total',
  help: 'Total successfully processed jobs',
  labelNames: ['result'],
  registers: [register],
});

export const jobsFailedTotal = new Counter({
  name: 'jobs_failed_total',
  help: 'Total failed jobs',
  labelNames: ['reason'],
  registers: [register],
});

export const jobDurationSeconds = new Histogram({
  name: 'job_duration_seconds',
  help: 'Job processing duration in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const toolCallsTotal = new Counter({
  name: 'tool_calls_total',
  help: 'Total function tool calls',
  labelNames: ['tool', 'status'],
  registers: [register],
});

export const toolDurationSeconds = new Histogram({
  name: 'tool_duration_seconds',
  help: 'Function tool execution duration in seconds',
  labelNames: ['tool'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const externalApiRequestsTotal = new Counter({
  name: 'external_api_requests_total',
  help: 'Total external API requests',
  labelNames: ['operation', 'status'],
  registers: [register],
});

export const externalApiLatencySeconds = new Histogram({
  name: 'external_api_latency_seconds',
  help: 'External API request latency in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const operationsUnknownTotal = new Counter({
  name: 'operations_unknown_total',
  help: 'Total operations ending in unknown state',
  labelNames: ['operation'],
  registers: [register],
});
