"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { useBrowserTz } from "@/lib/useBrowserTz";

/**
 * While the saved time zone is still "auto" (a fresh install), save the
 * browser's zone once so slot times mean the founder's wall clock everywhere,
 * including the server-side publisher. Renders nothing.
 */
export default function TimezoneSync() {
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  const tz = useBrowserTz();
  const sent = useRef(false);

  useEffect(() => {
    if (!settings || settings.timezone !== "auto" || tz === "UTC" || sent.current) return;
    sent.current = true;
    update({ patch: { timezone: tz } }).catch(() => {
      sent.current = false; // try again on the next render
    });
  }, [settings, tz, update]);

  return null;
}
