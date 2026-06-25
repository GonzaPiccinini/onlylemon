import { AccountPage } from "@/features/account/account-page";
import { useUpdateAdminAccount } from "@/features/admin/admin-hooks";

export const AdminAccountPage = () => {
  const updateAccount = useUpdateAdminAccount();

  return <AccountPage idPrefix="admin-account" updateAccount={updateAccount} />;
};
