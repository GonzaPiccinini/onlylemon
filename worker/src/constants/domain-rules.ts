export const DOMAIN_RULES = {
  userName: {
    minLength: 1,
    maxLength: 120,
  },
  depositAmount: {
    min: 2000,
    max: 1_000_000_000,
  },
} as const;
