import { DOMAIN_RULES } from '../../constants/domain-rules.js';

export class Usuario {
  private constructor(
    private readonly id: string | null,
    private readonly nombre: string,
  ) {}

  static crear(nombre: string) {
    const normalizedName = nombre.trim();
    if (
      normalizedName.length < DOMAIN_RULES.userName.minLength ||
      normalizedName.length > DOMAIN_RULES.userName.maxLength
    ) {
      throw new Error('INVALID_USER_NAME');
    }

    return new Usuario(null, normalizedName);
  }

  getId() {
    return this.id;
  }

  getNombre() {
    return this.nombre;
  }
}
