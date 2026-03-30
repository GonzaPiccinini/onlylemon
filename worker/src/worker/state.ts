let workerReady = false;

export function setWorkerReady(value: boolean) {
  workerReady = value;
}

export function isWorkerReady() {
  return workerReady;
}
