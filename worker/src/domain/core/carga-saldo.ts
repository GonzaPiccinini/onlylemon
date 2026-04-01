import { DOMAIN_RULES } from '../../constants/domain-rules.js';
import { Estado } from './estado.js';

export class CargaSaldo {
  private constructor(
    private readonly monto: number,
    private idOperacion: string,
    private estado: Estado,
  ) {}

  static crear(monto: number, idOperacion: string) {
    const parsedAmount = Math.trunc(monto);

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount < DOMAIN_RULES.depositAmount.min ||
      parsedAmount > DOMAIN_RULES.depositAmount.max
    ) {
      throw new Error('INVALID_DEPOSIT_AMOUNT');
    }

    const normalizedOperationId = idOperacion.trim();
    if (!normalizedOperationId) {
      throw new Error('INVALID_OPERATION_ID');
    }

    return new CargaSaldo(parsedAmount, normalizedOperationId, Estado.pendiente());
  }

  mostrarCargaSaldo() {
    return `${this.idOperacion}:${this.monto}`;
  }

  conocerUsuario() {
    return true;
  }

  setIdOperacion(idOperacion: string) {
    const normalized = idOperacion.trim();
    if (!normalized) {
      throw new Error('INVALID_OPERATION_ID');
    }
    this.idOperacion = normalized;
  }

  setEstado(estado: Estado) {
    this.estado = estado;
  }

  esCancelable() {
    return this.estado.estaPendiente();
  }

  estaCompletada() {
    return this.estado.getNombre() === 'COMPLETADA';
  }

  getMonto() {
    return this.monto;
  }

  getIdOperacion() {
    return this.idOperacion;
  }

  getEstado() {
    return this.estado;
  }
}
