import { config } from '../../config/env.js';

interface ConversionPayload {
  phoneNumber: string;
  value: number;
  fbc: string;
  fbp: string;
  userAgent: string;
  eventId: string;
}

const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

const sha256 = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const sendMetaConversion = async (
  payload: ConversionPayload,
): Promise<boolean> => {
  if (!config.META_PIXEL_ID || !config.META_ACCESS_TOKEN) {
    return false;
  }

  const hashedPhone = await sha256(normalizePhone(payload.phoneNumber));

  const response = await fetch(
    `https://graph.facebook.com/${config.META_API_VERSION}/${config.META_PIXEL_ID}/events?access_token=${config.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'system_generated',
            event_id: payload.eventId,
            user_data: {
              ph: [hashedPhone],
              fbc: payload.fbc,
              fbp: payload.fbp,
              client_user_agent: payload.userAgent,
            },
            custom_data: {
              currency: 'ARS',
              value: payload.value,
            },
          },
        ],
      }),
    },
  );

  return response.ok;
};
