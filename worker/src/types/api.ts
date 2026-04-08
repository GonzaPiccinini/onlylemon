export type Role = 'ADMIN' | 'CASHIER';

export interface AuthenticatedUser {
  userId: string;
  role: Role;
  cashierId?: string;
}
