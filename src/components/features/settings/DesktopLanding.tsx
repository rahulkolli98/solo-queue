"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEFAULT_SECTION } from "@/lib/settingsSections";

/**
 * /settings on a wide screen has nothing to show beside the section list, so
 * it opens the first section, now or as soon as the window becomes wide. On
 * a phone the list itself is the screen.
 */
export default function DesktopLanding() {
  const router = useRouter();
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const open = () => {
      if (wide.matches) router.replace(`/settings/${DEFAULT_SECTION}`);
    };
    open();
    wide.addEventListener("change", open);
    return () => wide.removeEventListener("change", open);
  }, [router]);
  return null;
}
