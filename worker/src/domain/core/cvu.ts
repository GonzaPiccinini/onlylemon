export class Cvu {
  private constructor(private readonly numero: string) {}

  static crear(numero: string) {
    const normalized = numero.trim();
    if (!normalized) {
      throw new Error('INVALID_CVU');
    }

    return new Cvu(normalized);
  }

  mostrarCVU() {
    return this.numero;
  }

  getNumero() {
    return this.numero;
  }
}
