import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  metaConversionEventsTotal,
  metaConversionDurationSeconds,
} from '../../lib/metrics.js';

type MetaEventName =
  | 'Purchase'
  | 'HighValueCustomer'
  | 'HighValueTier1'
  | 'HighValueTier2'
  | 'HighValueTier3'
  | 'Lead'
  | 'Contact';

type HighValueTierName = 'HighValueTier1' | 'HighValueTier2' | 'HighValueTier3';

const HIGH_VALUE_TIERS: ReadonlyArray<{
  threshold: number;
  eventName: HighValueTierName;
  idSuffix: string;
}> = [
  { threshold: 25_000, eventName: 'HighValueTier1', idSuffix: 'hvt1' },
  { threshold: 50_000, eventName: 'HighValueTier2', idSuffix: 'hvt2' },
  { threshold: 100_000, eventName: 'HighValueTier3', idSuffix: 'hvt3' },
];

interface MetaEventBase {
  fbc: string;
  fbp: string;
  userAgent: string;
  metaPixelId: string;
  metaAccessToken: string;
  eventSourceUrl: string;
  leadCode: string;
}

interface ConversionPayload extends MetaEventBase {
  phone: string;
  value: number;
  eventId: string;
}

interface LeadEventPayload extends MetaEventBase {
  eventId: string;
}

interface ContactEventPayload extends MetaEventBase {
  eventId: string;
  phone: string;
}

interface HighValueTierResult {
  eventName: HighValueTierName;
  required: boolean;
  sent: boolean;
}

interface MetaConversionResult {
  purchaseSent: boolean;
  highValueRequired: boolean;
  highValueSent: boolean;
  tiers: HighValueTierResult[];
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
  eventName: MetaEventName;
  eventId: string;
  base: MetaEventBase;
  hashedPhone?: string;
  hashedExternalId: string;
  customData?: { currency: string; value: number };
}): Promise<boolean> => {
  const startedAt = process.hrtime.bigint();

  const userData: Record<string, unknown> = {
    fbc: input.base.fbc,
    fbp: input.base.fbp,
    client_user_agent: input.base.userAgent,
    external_id: [input.hashedExternalId],
  };
  if (input.hashedPhone) {
    userData.ph = [input.hashedPhone];
  }

  const eventObject: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: input.base.eventSourceUrl,
    event_id: input.eventId,
    user_data: userData,
  };
  if (input.customData) {
    eventObject.custom_data = input.customData;
  }

  if (config.META_DRY_RUN) {
    logger.info(
      {
        dryRun: true,
        eventName: input.eventName,
        eventId: input.eventId,
        pixelId: input.base.metaPixelId,
        leadCode: input.base.leadCode,
        customData: input.customData,
      },
      'META_DRY_RUN: skipping CAPI POST (returning success)',
    );
    metaConversionEventsTotal.labels(input.eventName, 'dry_run').inc();
    metaConversionDurationSeconds
      .labels(input.eventName)
      .observe(Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);
    return true;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.META_API_VERSION}/${input.base.metaPixelId}/events?access_token=${input.base.metaAccessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [eventObject],
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

const toBase = (payload: MetaEventBase): MetaEventBase => ({
  fbc: payload.fbc,
  fbp: payload.fbp,
  userAgent: payload.userAgent,
  metaPixelId: payload.metaPixelId,
  metaAccessToken: payload.metaAccessToken,
  eventSourceUrl: payload.eventSourceUrl,
  leadCode: payload.leadCode,
});

export const sendMetaConversion = async (
  payload: ConversionPayload,
): Promise<MetaConversionResult> => {
  const hashedPhone = await sha256(normalizePhone(payload.phone));
  const hashedExternalId = await sha256(payload.leadCode.trim().toLowerCase());
  const base = toBase(payload);
  const customData = { currency: 'ARS', value: payload.value };

  const purchaseSent = await postMetaEvent({
    eventName: 'Purchase',
    eventId: payload.eventId,
    base,
    hashedPhone,
    hashedExternalId,
    customData,
  });

  const highValueRequired = payload.value >= 10_000;
  let highValueSent = false;

  if (highValueRequired) {
    highValueSent = await postMetaEvent({
      eventName: 'HighValueCustomer',
      eventId: `${payload.eventId}-hvc`,
      base,
      hashedPhone,
      hashedExternalId,
      customData,
    });
  }

  const tiers: HighValueTierResult[] = [];
  for (const tier of HIGH_VALUE_TIERS) {
    const required = payload.value >= tier.threshold;
    let sent = false;
    if (required) {
      sent = await postMetaEvent({
        eventName: tier.eventName,
        eventId: `${payload.eventId}-${tier.idSuffix}`,
        base,
        hashedPhone,
        hashedExternalId,
        customData,
      });
    }
    tiers.push({ eventName: tier.eventName, required, sent });
  }

  return {
    purchaseSent,
    highValueRequired,
    highValueSent,
    tiers,
  };
};

export const sendLeadEvent = async (
  payload: LeadEventPayload,
): Promise<boolean> => {
  const hashedExternalId = await sha256(payload.leadCode.trim().toLowerCase());
  return postMetaEvent({
    eventName: 'Lead',
    eventId: payload.eventId,
    base: toBase(payload),
    hashedExternalId,
  });
};

export const sendContactEvent = async (
  payload: ContactEventPayload,
): Promise<boolean> => {
  const hashedPhone = await sha256(normalizePhone(payload.phone));
  const hashedExternalId = await sha256(payload.leadCode.trim().toLowerCase());
  return postMetaEvent({
    eventName: 'Contact',
    eventId: payload.eventId,
    base: toBase(payload),
    hashedPhone,
    hashedExternalId,
  });
};
