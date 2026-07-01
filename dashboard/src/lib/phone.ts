// WhatsApp for Argentina always uses the 549 prefix. In the linking UIs the
// operator types only the local part and we prepend 549 on submit. These helpers
// keep the prefix from ever being doubled if a full number (549...) or a leading
// 0 is pasted instead.
export const AR_PHONE_PREFIX = '549';

/** Digits only, without a leading 0 or an already-present 549 prefix. */
export const localPhonePart = (value: string): string =>
  value
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .replace(new RegExp(`^${AR_PHONE_PREFIX}`), '');

/** Full number sent to WhatsApp: always 549 + local part. */
export const toArgentinePhone = (value: string): string =>
  `${AR_PHONE_PREFIX}${localPhonePart(value)}`;
