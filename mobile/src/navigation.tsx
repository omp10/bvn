import { useCallback, useRef, type ReactElement } from "react";
import { View } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "./auth";
import { useNotificationTaps } from "./push";
import { colors, VARIANT } from "./theme";
import { Button, Loading, Muted, Screen, T } from "./ui";
import {
  IconBell, IconBus, IconHistory, IconHome, IconMap, IconUser, IconUsers,
} from "./icons";

import ParentLogin from "./screens/ParentLogin";
import StaffLogin from "./screens/StaffLogin";
import ParentHome from "./screens/ParentHome";
import ParentHistory from "./screens/ParentHistory";
import Alerts from "./screens/Alerts";
import Profile from "./screens/Profile";
import DriverTrip from "./screens/DriverTrip";
import DriverLive from "./screens/DriverLive";
import DriverHistory from "./screens/DriverHistory";
import AttendantRoster from "./screens/AttendantRoster";
import Overview from "./screens/Overview";
import SchoolLive from "./screens/SchoolLive";
import OwnerFleet from "./screens/OwnerFleet";

const Tab = createBottomTabNavigator();
export const navRef = createNavigationContainerRef();

type IconProps = { size?: number; color?: string };
type TabDef = { name: string; title: string; component: React.ComponentType<any>; icon: (p: IconProps) => ReactElement };

/**
 * Which tabs each person sees.
 *
 * Keyed by role, not by app: the staff APK serves drivers and attendants, and
 * the two jobs have almost nothing in common once you are past sign-in. A driver
 * has no roster and an attendant has no trip to start.
 */
const TABS: Record<string, TabDef[]> = {
  parent: [
    { name: "Home", title: "Your bus", component: ParentHome, icon: IconHome },
    { name: "History", title: "History", component: ParentHistory, icon: IconHistory },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
  driver: [
    { name: "Trip", title: "Today's trip", component: DriverTrip, icon: IconBus },
    { name: "Live", title: "Live map", component: DriverLive, icon: IconMap },
    { name: "History", title: "My trips", component: DriverHistory, icon: IconHistory },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
  staff: [
    { name: "Trip", title: "Roster", component: AttendantRoster, icon: IconUsers },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
  /* The desk roles get a read-only view. Managing students, routes and salaries
     is a sidebar-sized job that belongs on the web app; what a phone is good for
     is "where are my buses and is anything wrong". */
  school_admin: [
    { name: "Overview", title: "Today", component: Overview, icon: IconHome },
    { name: "Live", title: "Live buses", component: SchoolLive, icon: IconMap },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
  owner: [
    { name: "Overview", title: "Overview", component: Overview, icon: IconHome },
    { name: "Live", title: "My vehicles", component: OwnerFleet, icon: IconBus },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
  super_admin: [
    { name: "Overview", title: "Platform", component: Overview, icon: IconHome },
    { name: "Alerts", title: "Alerts", component: Alerts, icon: IconBell },
    { name: "Profile", title: "Profile", component: Profile, icon: IconUser },
  ],
};

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand600,
    background: colors.slate50,
    card: colors.white,
    text: colors.slate900,
    border: colors.slate200,
  },
};

function Tabs({ role }: { role: string }) {
  /* An unrecognised role gets the two tabs that need no role-specific endpoint.
     Falling back to the parent tabs would fetch /parent/children as a driver and
     show a permission error where a screen should be. */
  const tabs = TABS[role] ?? TABS.super_admin.slice(1);

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { fontWeight: "700", fontSize: 17, color: colors.slate900 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.slate400,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: { borderTopColor: colors.slate200, height: 62, paddingTop: 6, paddingBottom: 8 },
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => tab.icon({ size, color }),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

/** Someone installed the driver app and signed in as a parent, or the reverse. */
function WrongApp() {
  const { user, signOut } = useAuth();
  const wanted = VARIANT === "parent" ? "BalVahini Staff" : "BalVahini Parent";

  return (
    <Screen>
      <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
        <T size={17} weight="700">This is the wrong app</T>
        <Muted style={{ textAlign: "center", lineHeight: 19 }}>
          {user?.name}, your account is a {user?.role.replace("_", " ")} account. Install {wanted} and sign in
          there instead.
        </Muted>
      </View>
      <Button variant="secondary" block onPress={signOut}>Sign out</Button>
    </Screen>
  );
}

export default function Navigation() {
  const { user, ready, wrongApp } = useAuth();
  const pending = useRef<string | null>(null);

  /* A tapped notification should land where the alert lives. Both apps have an
     Alerts tab, so this is a tab switch rather than a routing table. */
  const openFromNotification = useCallback((_type: string) => {
    if (navRef.isReady()) navRef.navigate("Alerts" as never);
    else pending.current = "Alerts";
  }, []);
  useNotificationTaps(openFromNotification);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.slate50 }}>
        <StatusBar style="dark" />
        <Loading />
      </View>
    );
  }

  if (!user) return VARIANT === "parent" ? <ParentLogin /> : <StaffLogin />;

  return (
    <NavigationContainer
      ref={navRef}
      theme={theme}
      onReady={() => {
        if (!pending.current) return;
        navRef.navigate(pending.current as never);
        pending.current = null;
      }}
    >
      <StatusBar style="dark" />
      {wrongApp ? <WrongApp /> : <Tabs role={user.role} />}
    </NavigationContainer>
  );
}
