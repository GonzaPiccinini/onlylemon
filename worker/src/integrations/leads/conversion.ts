import { config } from '../../config/env.js';
import {
  metaConversionEventsTotal,
  metaConversionDurationSeconds,
} from '../../lib/metrics.js';

interface ConversionPayload {
  phone: string;
  value: number;
  fbc: string;
  fbp: string;
  userAgent: string;
  metaPixelId: string;
  metaAccessToken: string;
  eventId: string;
  eventSourceUrl: string;
}

interface MetaConversionResult {
  purchaseSent: boolean;
  highValueRequired: boolean;
  highValueSent: boolean;
}

const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

const sha256 = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const postMetaEvent = async (input: {
  hashedPhone: string;
  eventName: 'Purchase' | 'HighValueCustomer';
  eventId: string;
  payload: ConversionPayload;
}): Promise<boolean> => {
  const startedAt = process.hrtime.bigint();

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.META_API_VERSION}/${input.payload.metaPixelId}/events?access_token=${input.payload.metaAccessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            {
              event_name: input.eventName,
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              event_source_url: input.payload.eventSourceUrl,
              event_id: input.eventId,
              user_data: {
                ph: [input.hashedPhone],
                fbc: input.payload.fbc,
                fbp: input.payload.fbp,
                client_user_agent: input.payload.userAgent,
              },
              custom_data: {
                currency: 'ARS',
                value: input.payload.value,
              },
            },
          ],
        }),
      },
    );

    const result = response.ok ? 'success' : 'failure';
    metaConversionEventsTotal.labels(input.eventName, result).inc();
    metaConversionDurationSeconds
      .labels(input.eventName)
      .observe(Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);

    return response.ok;
  } catch (error) {
    metaConversionEventsTotal.labels(input.eventName, 'error').inc();
    metaConversionDurationSeconds
      .labels(input.eventName)
      .observe(Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);
    throw error;
  }
};

export const sendMetaConversion = async (
  payload: ConversionPayload,
): Promise<MetaConversionResult> => {
  const hashedPhone = await sha256(normalizePhone(payload.phone));
  const purchaseSent = await postMetaEvent({
    hashedPhone,
    eventName: 'Purchase',
    eventId: payload.eventId,
    payload,
  });

  const highValueRequired = payload.value > 10_000;
  let highValueSent = false;

  if (highValueRequired) {
    highValueSent = await postMetaEvent({
      hashedPhone,
      eventName: 'HighValueCustomer',
      eventId: `${payload.eventId}-hvc`,
      payload,
    });
  }

  return {
    purchaseSent,
    highValueRequired,
    highValueSent,
  };
};
