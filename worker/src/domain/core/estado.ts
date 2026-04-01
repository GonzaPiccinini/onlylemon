export class Estado {
  private constructor(
    private readonly nombre: string,
    private readonly descripcion: string,
  ) {}

  static pendiente() {
    return new Estado('PENDIENTE', 'Operacion pendiente de confirmacion');
  }

  static completada() {
    return new Estado('COMPLETADA', 'Operacion completada con exito');
  }

  static cancelada() {
    return new Estado('CANCELADA', 'Operacion no pudo completarse');
  }

  mostrarEstado() {
    return this.descripcion;
  }

  getNombre() {
    return this.nombre;
  }

  estaPendiente() {
    return this.nombre === 'PENDIENTE';
  }

  estaPendienteDeAprobacion() {
    return this.estaPendiente();
  }
}
