import { Chat } from './chat.js';
import { Cvu } from './cvu.js';

export class Sesion {
  private chats: Chat[];
  private cvu: Cvu | null;

  private constructor(
    private readonly id: string,
    private readonly nombre: string,
    chats: Chat[],
    cvu: Cvu | null,
  ) {
    this.chats = chats;
    this.cvu = cvu;
  }

  static crear(id: string, nombre: string) {
    const normalizedId = id.trim();
    const normalizedName = nombre.trim();
    if (!normalizedId || !normalizedName) {
      throw new Error('INVALID_SESSION');
    }

    return new Sesion(normalizedId, normalizedName, [], null);
  }

  mostrarSesion() {
    return this.nombre;
  }

  getNombre() {
    return this.nombre;
  }

  validarSiExisteChat(chatId: string) {
    return this.chats.some((chat) => chat.getId() === chatId);
  }

  setChat(chat: Chat) {
    this.chats = [...this.chats.filter((item) => item.getId() !== chat.getId()), chat];
  }

  getCVU() {
    return this.cvu;
  }

  setCVU(cvu: Cvu) {
    this.cvu = cvu;
  }

  getId() {
    return this.id;
  }
}
