import Svg, { Path } from "react-native-svg";
import { colors } from "./theme";

/**
 * The same stroke set the web app draws, as react-native-svg paths. Inline so
 * there is no icon font to load and no second asset pipeline to keep in step.
 */
type P = { size?: number; color?: string };

const Icon = ({ d, size = 20, color = colors.slate600 }: P & { d: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconHome = (p: P) => <Icon {...p} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
export const IconBus = (p: P) => <Icon {...p} d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10M4 16h16M4 16v2m16-2v2M7 8h10M6.5 12.5h.01M17.5 12.5h.01" />;
export const IconUsers = (p: P) => <Icon {...p} d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19M9 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1.5a4 4 0 0 0-3-3.87M16 3.6a4 4 0 0 1 0 7.75" />;
export const IconMap = (p: P) => <Icon {...p} d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13" />;
export const IconSchool = (p: P) => <Icon {...p} d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6M12 4V2" />;
export const IconBell = (p: P) => <Icon {...p} d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M13.7 20a2 2 0 0 1-3.4 0" />;
export const IconAlert = (p: P) => <Icon {...p} d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />;
export const IconCheck = (p: P) => <Icon {...p} d="m20 6-11 11-5-5" />;
export const IconClock = (p: P) => <Icon {...p} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />;
export const IconPin = (p: P) => <Icon {...p} d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />;
export const IconLogout = (p: P) => <Icon {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />;
export const IconShield = (p: P) => <Icon {...p} d="M12 3 4 6v6c0 5 3.4 8.4 8 9.6 4.6-1.2 8-4.6 8-9.6V6z" />;
export const IconUser = (p: P) => <Icon {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />;
export const IconCamera = (p: P) => <Icon {...p} d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2a1 1 0 0 0 .8-.4l1-1.3a1 1 0 0 1 .8-.4h5.4a1 1 0 0 1 .8.4l1 1.3a1 1 0 0 0 .8.4h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5zM12 15.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />;
export const IconPhone = (p: P) => <Icon {...p} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />;
export const IconHistory = (p: P) => <Icon {...p} d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3.5 2" />;
