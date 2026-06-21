import type { SessionsList } from './client.js';

export type EnsureSessionsResult = {
  checked: number;
  updated: number;
  failed: number;
};

export type EnsureSessionsDeps = {
  getSessions: () => Promise<SessionsList>;
  updateSessionConfig: (sessionName: string, config: object) => Promise<void>;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
};

/**
 * Idempotent boot-time fixup.
 *
 * Lists all WAHA sessions. For each session whose first webhook entry is missing
 * 'message.reaction' in its events array, PUTs an updated config that adds it.
 *
 * Sessions already subscribed are skipped (idempotent).
 * Sessions with no webhook entries are skipped (nothing to patch).
 * Per-session failures are caught, logged as warn, counted as `failed`,
 * and do NOT abort the loop.
 * If `getSessions` itself throws (e.g. WAHA unreachable at boot), the function
 * logs a warn and returns zero counts — never throws.
 *
 * ADR-8: This ensures sessions created before 'message.reaction' was added to
 * the default event set are retroactively subscribed on next worker boot.
 *
 * NOTE: PUT /api/sessions/{name} shape needs live verification in Batch 14 QA
 * (the Batch 0 smoke session had config.webhooks = [] so the PUT path was not
 * exercised against a real session with webhooks).
 */
export async function ensureSessionsSubscribedToReactions(
  deps: EnsureSessionsDeps,
): Promise<EnsureSessionsResult> {
  const { getSessions, updateSessionConfig, logger } = deps;

  let sessions: SessionsList;
  try {
    sessions = await getSessions();
  } catch (err) {
    logger.warn(
      { err },
      'ensureSessionsSubscribedToReactions: getSessions failed (WAHA unreachable?), skipping boot fixup',
    );
    return { checked: 0, updated: 0, failed: 0 };
  }

  let updated = 0;
  let failed = 0;

  for (const session of sessions) {
    const webhooks = session.config?.webhooks ?? [];

    if (webhooks.length === 0) {
      // No webhook entry to patch — skip silently (not an error).
      continue;
    }

    const firstWebhook = webhooks[0];
    const events: string[] = firstWebhook.events ?? [];

    if (events.includes('message.reaction')) {
      // Already subscribed — idempotent skip.
      continue;
    }

    // Build the updated config: add 'message.reaction' to the first webhook's events.
    // We preserve the full webhooks array and only mutate the events of webhooks[0].
    const updatedWebhooks = webhooks.map((wh, idx) => {
      if (idx !== 0) return wh;
      return {
        ...wh,
        events: [...wh.events, 'message.reaction'],
      };
    });

    const updatedConfig = {
      ...session.config,
      webhooks: updatedWebhooks,
    };

    try {
      await updateSessionConfig(session.name, updatedConfig);
      updated++;
      logger.info(
        { sessionName: session.name },
        'ensureSessionsSubscribedToReactions: added message.reaction to session webhook config',
      );
    } catch (err) {
      failed++;
      logger.warn(
        { err, sessionName: session.name },
        'ensureSessionsSubscribedToReactions: failed to update session config, continuing',
      );
    }
  }

  return { checked: sessions.length, updated, failed };
}
