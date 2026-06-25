import { AccountPage } from "@/features/account/account-page";
import { useUpdateCashierAccount } from "@/features/cashier/cashier-hooks";

export const CashierAccountPage = () => {
  const updateAccount = useUpdateCashierAccount();

  return (
    <AccountPage idPrefix="cashier-account" updateAccount={updateAccount} />
  );
};
