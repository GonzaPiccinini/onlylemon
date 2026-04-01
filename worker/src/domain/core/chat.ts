import { CargaSaldo } from './carga-saldo.js';
import { Mensaje } from './mensaje.js';
import { Usuario } from './usuario.js';

export class Chat {
  private readonly mensajes: Mensaje[];
  private readonly cargasSaldo: CargaSaldo[];
  private usuario: Usuario | null;

  private constructor(
    private readonly id: string,
    usuario: Usuario | null,
    mensajes: Mensaje[],
    cargasSaldo: CargaSaldo[],
  ) {
    this.usuario = usuario;
    this.mensajes = mensajes;
    this.cargasSaldo = cargasSaldo;
  }

  static crear(id: string, usuario: Usuario | null = null) {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error('INVALID_CHAT_ID');
    }

    return new Chat(normalizedId, usuario, [], []);
  }

  mostrarUsuario() {
    return this.usuario?.getNombre() ?? null;
  }

  tieneUsuarioAsociado() {
    return this.usuario !== null;
  }

  setUsuario(usuario: Usuario) {
    this.usuario = usuario;
  }

  obtenerMensajes() {
    return [...this.mensajes];
  }

  setCargaSaldo(cargaSaldo: CargaSaldo) {
    this.cargasSaldo.push(cargaSaldo);
  }

  agregarMensaje(mensaje: Mensaje) {
    this.mensajes.push(mensaje);
  }

  getId() {
    return this.id;
  }
}
