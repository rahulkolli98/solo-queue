import { notFound } from "next/navigation";
import BillingSection from "@/components/features/settings/BillingSection";
import ConnectionsSection from "@/components/features/settings/ConnectionsSection";
import PillarsSection from "@/components/features/settings/PillarsSection";
import PlannedSection from "@/components/features/settings/PlannedSection";
import SlotsSection from "@/components/features/settings/SlotsSection";
import VoiceSection from "@/components/features/settings/VoiceSection";
import { SETTINGS_SECTIONS, findSection } from "@/lib/settingsSections";

export function generateStaticParams() {
  return SETTINGS_SECTIONS.map((s) => ({ section: s.key }));
}

export default async function SettingsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ error?: string; connected?: string; detail?: string }>;
}) {
  const { section: key } = await params;
  const section = findSection(key);
  if (!section) notFound();
  const query = await searchParams;

  return (
    <div className="st-section">
      <div className="st-section-head">
        <h2 className="st-section-title">{section.label}</h2>
        <p className="st-section-blurb">{section.blurb}</p>
      </div>
      {key === "connections" ? (
        <ConnectionsSection connected={query.connected} error={query.error} detail={query.detail} />
      ) : key === "slots" ? (
        <SlotsSection />
      ) : key === "voice" ? (
        <VoiceSection />
      ) : key === "pillars" ? (
        <PillarsSection />
      ) : key === "billing" ? (
        <BillingSection />
      ) : (
        <PlannedSection label={section.label} />
      )}
    </div>
  );
}
