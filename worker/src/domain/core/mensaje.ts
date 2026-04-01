export type MensajeProps = {
  id: string;
  fecha: number;
  cuerpo: string;
  esImagen: boolean;
  enviadoPorUsuario: boolean;
};

export class Mensaje {
  private constructor(private readonly props: MensajeProps) {}

  static crear(props: MensajeProps) {
    if (!props.id.trim() || !props.cuerpo.trim()) {
      throw new Error('INVALID_MESSAGE');
    }

    return new Mensaje({
      ...props,
      id: props.id.trim(),
      cuerpo: props.cuerpo.trim(),
    });
  }

  mostrarUsuario() {
    return this.props.enviadoPorUsuario ? 'usuario' : 'sistema';
  }

  getId() {
    return this.props.id;
  }

  getFecha() {
    return this.props.fecha;
  }

  getCuerpo() {
    return this.props.cuerpo;
  }

  getEsImagen() {
    return this.props.esImagen;
  }

  getEnviadoPorUsuario() {
    return this.props.enviadoPorUsuario;
  }
}
