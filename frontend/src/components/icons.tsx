/** Small stroke icon set — inline so there is no icon-font or package to load. */
const Svg = ({ d, className = "h-5 w-5" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

type P = { className?: string };

export const IconHome = (p: P) => <Svg {...p} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
export const IconBus = (p: P) => <Svg {...p} d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10M4 16h16M4 16v2m16-2v2M7 8h10M6.5 12.5h.01M17.5 12.5h.01" />;
export const IconUsers = (p: P) => <Svg {...p} d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19M9 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1.5a4 4 0 0 0-3-3.87M16 3.6a4 4 0 0 1 0 7.75" />;
export const IconStudent = (p: P) => <Svg {...p} d="M12 4 2 8.5 12 13l10-4.5zM6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />;
export const IconRoute = (p: P) => <Svg {...p} d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8" />;
export const IconMap = (p: P) => <Svg {...p} d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13" />;
export const IconSchool = (p: P) => <Svg {...p} d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6M12 4V2" />;
export const IconChart = (p: P) => <Svg {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />;
export const IconWallet = (p: P) => <Svg {...p} d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M3 8h16a2 2 0 0 1 2 2v1h-5a2 2 0 0 0 0 4h5" />;
export const IconBell = (p: P) => <Svg {...p} d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M13.7 20a2 2 0 0 1-3.4 0" />;
export const IconAlert = (p: P) => <Svg {...p} d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />;
export const IconCheck = (p: P) => <Svg {...p} d="m20 6-11 11-5-5" />;
export const IconClock = (p: P) => <Svg {...p} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />;
export const IconPin = (p: P) => <Svg {...p} d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />;
export const IconLogout = (p: P) => <Svg {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />;
export const IconPlus = (p: P) => <Svg {...p} d="M12 5v14M5 12h14" />;
export const IconDownload = (p: P) => <Svg {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />;
export const IconSearch = (p: P) => <Svg {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />;
export const IconShield = (p: P) => <Svg {...p} d="M12 3 4 6v6c0 5 3.4 8.4 8 9.6 4.6-1.2 8-4.6 8-9.6V6z" />;
export const IconMenu = (p: P) => <Svg {...p} d="M4 7h16M4 12h16M4 17h16" />;
export const IconCamera = (p: P) => <Svg {...p} d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2a1 1 0 0 0 .8-.4l1-1.3a1 1 0 0 1 .8-.4h5.4a1 1 0 0 1 .8.4l1 1.3a1 1 0 0 0 .8.4h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5zM12 15.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />;
export const IconPhone = (p: P) => <Svg {...p} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />;
