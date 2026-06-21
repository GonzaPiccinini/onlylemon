import { PageHeader } from '@/components/common/page-header';
import { AutoConversionSettings } from './auto-conversion-settings';
import { CurrencySettings } from './currency-settings';

export const AdminSettingsPage = () => {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Configuracion"
        description="Ajustes generales del sistema."
      />

      <AutoConversionSettings />
      <CurrencySettings />
    </section>
  );
};
