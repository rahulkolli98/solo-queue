import type { SVGProps } from "react";

/** Line icons shared by the sidebar, the tab bar and the page chrome. */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const TodayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const StudioIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const QueueIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const ResearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </Icon>
);

export const LibraryIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon strokeWidth="2.6">
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon strokeWidth="2">
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon strokeWidth="2">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18" />
  </Icon>
);

export const ClockIcon = () => (
  <Icon strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const ArrowRightIcon = () => (
  <Icon strokeWidth="2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon strokeWidth="2">
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export type IconKey = "today" | "studio" | "queue" | "research" | "library";

const BY_KEY: Record<IconKey, () => React.JSX.Element> = {
  today: TodayIcon,
  studio: StudioIcon,
  queue: QueueIcon,
  research: ResearchIcon,
  library: LibraryIcon,
};

export function NavIcon({ name }: { name: IconKey }) {
  const Component = BY_KEY[name];
  return <Component />;
}
