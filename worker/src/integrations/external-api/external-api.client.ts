import { config } from '../../core/config.js';

export type ApiErrorKind = 'transient' | 'non_retryable' | 'ambiguous';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;

  constructor(message: string, kind: ApiErrorKind, code: string) {
    super(message);
    this.name = 'ExternalApiError';
    this.kind = kind;
    this.code = code;
  }
}

type CreateUserPayload = {
  name: string;
};

type DepositPayload = {
  name: string;
  amount: number;
};

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(config.externalApi.apiKey
      ? { Authorization: `Bearer ${config.externalApi.apiKey}` }
      : {}),
  };
}

function classifyStatus(status: number): ApiError {
  if (status >= 500) {
    return new ApiError(
      'External API transient failure',
      'transient',
      `HTTP_${status}`,
    );
  }

  return new ApiError(
    'External API rejected request',
    'non_retryable',
    `HTTP_${status}`,
  );
}

async function postJson(path: string, payload: unknown) {
  const url = `${config.externalApi.baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.externalApi.timeoutMs,
  );
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw classifyStatus(response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'External API timeout with unknown execution state',
        'ambiguous',
        'TIMEOUT',
      );
    }

    throw new ApiError(
      'External API network error with unknown execution state',
      'ambiguous',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function createUser(payload: CreateUserPayload) {
  await postJson('/users', payload);
}

export async function depositMoney(payload: DepositPayload) {
  await postJson(`/users/${encodeURIComponent(payload.name)}/deposits`, {
    amount: payload.amount,
  });
}
