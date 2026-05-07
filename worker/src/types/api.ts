export type Role = 'ADMIN' | 'CASHIER' | 'SUPER_ADMIN';

export interface AuthenticatedUser {
  userId: string;
  role: Role;
  cashierId?: string;
}
