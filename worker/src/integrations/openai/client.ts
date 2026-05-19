/**
 * OpenAI integration — OCR amount extraction from WhatsApp payment receipts.
 *
 * Uses raw fetch (no SDK). Reads env vars at call time to allow test-time
 * env manipulation without module cache issues.
 */

export class OpenAiUnavailableError extends Error {
  constructor(message = 'OpenAI unavailable after retry') {
    super(message);
    this.name = 'OpenAiUnavailableError';
  }
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_AMOUNT = 10_000_000;
const RETRY_DELAY_MS = 1500;

const SYSTEM_PROMPT = `You are an OCR for Argentine bank/wallet deposit receipts.
Respond ONLY with strict JSON: {"amount": <number_in_ARS>} or {"amount": null}.
No prose. No currency symbol. Use a dot for decimals. If unreadable, null.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmount(content: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || !('amount' in parsed)) {
    return null;
  }

  const { amount } = parsed as { amount: unknown };

  if (amount === null) {
    return null;
  }

  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_AMOUNT) {
    return null;
  }

  return num;
}

async function callOpenAi(
  apiKey: string,
  model: string,
  buf: Buffer,
  mimetype: string,
): Promise<Response> {
  const base64 = buf.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;

  const body = JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 50,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
  });

  return fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
}

/**
 * Extracts the ARS amount from a payment receipt image using OpenAI vision.
 *
 * Returns the amount as a number, or null if:
 * - The model could not read the amount
 * - The parsed value is invalid (NaN, negative, zero, > 10_000_000)
 * - The response JSON is malformed
 *
 * Throws OpenAiUnavailableError on 429/5xx after one retry (1.5s backoff).
 * Throws if OPENAI_API_KEY is not set.
 */
export async function extractAmountFromImage(
  buf: Buffer,
  mimetype: string,
): Promise<number | null> {
  // Read env at call time — not at import time — so tests can manipulate env vars
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  let response = await callOpenAi(apiKey, model, buf, mimetype);

  if (!response.ok && (response.status === 429 || response.status >= 500)) {
    // One retry with backoff
    await sleep(RETRY_DELAY_MS);
    response = await callOpenAi(apiKey, model, buf, mimetype);

    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      throw new OpenAiUnavailableError(
        `OpenAI returned ${response.status} after retry`,
      );
    }
  }

  let responseBody: { choices?: { message?: { content?: string } }[] };
  try {
    responseBody = (await response.json()) as typeof responseBody;
  } catch {
    return null;
  }

  const content = responseBody?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return null;
  }

  return parseAmount(content);
}
