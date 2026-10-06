import type { ReactNode } from "react";
import SettingsShell from "@/components/features/settings/SettingsShell";

export const metadata = { title: "Settings · Solo Queue" };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="st-head">
        <div>
          <span className="sq-tag">Settings</span>
          <h1 className="sq-headline">
            Set it once. <em>Post for weeks.</em>
          </h1>
        </div>
      </div>
      <SettingsShell>{children}</SettingsShell>
    </>
  );
}
