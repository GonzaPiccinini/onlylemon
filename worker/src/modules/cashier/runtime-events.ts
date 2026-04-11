import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

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
