import { LandingsConsole } from "@/features/admin/landings/landings-console";

/**
 * Route entry for /admin/landings.
 *
 * The former flat table + modal soup was replaced by a master-detail console.
 * This stays as a thin wrapper so the router import site is unchanged.
 */
export const AdminLandingsPage = () => <LandingsConsole />;
