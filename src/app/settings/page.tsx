import DesktopLanding from "@/components/features/settings/DesktopLanding";

/**
 * /settings is the section list on a phone and opens Connections on a wide
 * screen. (Links that carry an OAuth result, ?connected= or ?error=, are
 * redirected to Connections by next.config.ts before they get here.)
 */
export default function SettingsIndexPage() {
  return <DesktopLanding />;
}
