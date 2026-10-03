"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useMemo } from "react";
import SessionGate from "@/components/SessionGate";
import { useOperatorAuth } from "@/lib/useOperatorAuth";

export default function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
    return new ConvexReactClient(url);
  }, []);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useOperatorAuth}>
      <SessionGate>{children}</SessionGate>
    </ConvexProviderWithAuth>
  );
}
