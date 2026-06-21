import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
// One listener per active runtime-state SSE connection. Per-user connection caps
// live in realtime.routes.ts; this finite ceiling is a leak canary (warning only,
// never a hard failure) instead of the unlimited `0`. Raise it if you expect more
// than this many concurrent dashboard streams.
const MAX_SSE_LISTENERS = 1000;
emitter.setMaxListeners(MAX_SSE_LISTENERS);

const RUNTIME_STATE_CHANGED_EVENT = 'cashier-runtime-state-changed';

export const emitCashierRuntimeStateChanged = (cashierId: string) => {
  emitter.emit(RUNTIME_STATE_CHANGED_EVENT, cashierId);
};

export const subscribeCashierRuntimeStateChanged = (
  cashierId: string,
  listener: () => void,
) => {
  const wrapped = (changedCashierId: string) => {
    if (changedCashierId === cashierId) {
      listener();
    }
  };

  emitter.on(RUNTIME_STATE_CHANGED_EVENT, wrapped);

  return () => {
    emitter.off(RUNTIME_STATE_CHANGED_EVENT, wrapped);
  };
};
