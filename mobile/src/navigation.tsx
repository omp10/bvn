import {
  createContext, useCallback, useContext, useMemo, useRef, type ReactElement, type ReactNode,
} from "react";
import { Pressable, View } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { usePolling } from "./api";
import { useAuth } from "./auth";
import { useBrand } from "./brand";
import { useSocket } from "./socket";
import { useNotificationTaps } from "./push";
import { colors, space, tone, VARIANT } from "./theme";
import { str } from "./strings";
import { Button, Loading, Muted, Screen, SchoolLogo, T } from "./ui";
import {
  IconBell, IconBus, IconHistory, IconHome, IconMap, IconUser, IconUsers,
} from "./icons";

import ParentLogin from "./screens/ParentLogin";
import StaffLogin from "./screens/StaffLogin";
import ParentHome from "./screens/ParentHome";
import ParentHistory from "./screens/ParentHistory";
import OnboardingReplay, {
  INTRO_KEY, IntroOnboarding, ROLE_KEY, RoleOnboarding, useOnboarded,
} from "./screens/Onboarding";
import Alerts from "./screens/Alerts";
import Profile from "./screens/Profile";
import DriverTrip from "./screens/DriverTrip";
import DriverLive from "./screens/DriverLive";
import DriverHistory from "./screens/DriverHistory";
import AttendantRoster from "./screens/AttendantRoster";
import DriverStudents from "./screens/DriverStudents";
import Overview from "./screens/Overview";
import SchoolLive from "./screens/SchoolLive";
import OwnerFleet from "./screens/OwnerFleet";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
export const navRef = createNavigationContainerRef();

type IconProps = { size?: number; color?: string };
type TabDef = { name: string; title: string; component: React.ComponentType<any>; icon: (p: IconProps) => ReactElement };

/**
 * Which tabs each person sees.
 *
 * Keyed by role, not by app: the staff APK serves drivers and attendants, and
 * the two jobs have almost nothing in common once you are past sign-in. A driver
 * has no roster and an attendant has no trip to start.
 *
 * Alerts is a header bell everywhere rather than a tab. It is a destination
 * people arrive at from a notification, not one they navigate to on purpose,
 * and it was costing every role a tab slot — six of them for the driver, where
 * the labels stopped being readable. History is the same argument one step
 * further: nobody opens last week's trips mid-shift, so the driver's lives in
 * Profile and only the parent — whose history is a weekly habit — keeps a tab.
 */
const TABS: Record<string, TabDef[]> = {
  parent: [
    { name: "Home", title: str.nav.home, component: ParentHome, icon: IconHome },
    { name: "History", title: str.nav.history, component: ParentHistory, icon: IconHistory },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
  /* Four, down from six. Trip and Live were the same job at two zoom levels, so
     Trip keeps a map preview that opens the Map tab full screen; History went to
     Profile; Alerts went to the bell. */
  driver: [
    { name: "Trip", title: str.nav.trip, component: DriverTrip, icon: IconBus },
    { name: "Students", title: str.nav.students, component: DriverStudents, icon: IconUsers },
    { name: "Map", title: str.nav.map, component: DriverLive, icon: IconMap },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
  staff: [
    { name: "Roster", title: str.nav.roster, component: AttendantRoster, icon: IconUsers },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
  /* The desk roles get a read-only view. Managing students, routes and salaries
     is a sidebar-sized job that belongs on the web app; what a phone is good for
     is "where are my buses and is anything wrong". */
  school_admin: [
    { name: "Overview", title: str.nav.today, component: Overview, icon: IconHome },
    { name: "Live", title: str.nav.live, component: SchoolLive, icon: IconMap },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
  owner: [
    { name: "Overview", title: str.nav.overview, component: Overview, icon: IconHome },
    { name: "Live", title: str.nav.vehicles, component: OwnerFleet, icon: IconBus },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
  super_admin: [
    { name: "Overview", title: str.nav.platform, component: Overview, icon: IconHome },
    { name: "Profile", title: str.nav.profile, component: Profile, icon: IconUser },
  ],
};

/**
 * Extra destinations, pushed from a tab rather than owning a tab.
 *
 * Role-gated because a stack screen nobody can reach is still a screen that can
 * fetch — the driver's history hitting `/driver/trips` as a parent would be a
 * permission error waiting for a stray `navigate` call.
 *
 * The parent needs nothing here: `BusMap` already carries its own full-screen
 * presentation, so the map preview on Home expands in place rather than pushing
 * a route that would duplicate it.
 */
const STACK_SCREENS: Record<string, { name: string; title: string; component: React.ComponentType<any> }[]> = {
  driver: [{ name: "TripHistory", title: str.nav.history, component: DriverHistory }],
};

/* ── Unread alerts ─────────────────────────────────────────────────────
 *
 * One poll for the whole app. The bell renders in every tab's header, and a
 * `usePolling` inside it would mean one request per mounted tab — four, for a
 * driver, all asking the same question.
 */

const UnreadContext = createContext<{ unread: number; refresh: () => void }>({ unread: 0, refresh: () => {} });

function UnreadProvider({ children }: { children: ReactNode }) {
  const { data, reload } = usePolling<{ unread: number }>("/notifications?limit=1", 60_000);
  useSocket({ notification: () => reload() }, []);

  const value = useMemo(() => ({ unread: data?.unread ?? 0, refresh: reload }), [data?.unread, reload]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export const useUnread = () => useContext(UnreadContext);

/** The header bell. Count as well as colour — a red dot alone says nothing. */
function AlertsBell() {
  const { unread } = useUnread();
  const brand = useBrand();

  return (
    <Pressable
      onPress={() => navRef.isReady() && navRef.navigate("Alerts" as never)}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? str.nav.unreadAlerts(unread) : str.nav.openAlerts}
      hitSlop={10}
      style={({ pressed }) => [{ padding: space(2), marginRight: space(1) }, pressed && { opacity: 0.6 }]}
    >
      <IconBell size={24} color={tone.textSecondary} />
      {unread > 0 && (
        <View
          style={{
            position: "absolute",
            top: space(1),
            right: space(1),
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: colors.red600,
            borderWidth: 2,
            borderColor: colors.white,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T size={10} weight="800" color={colors.white}>
            {unread > 9 ? "9+" : unread}
          </T>
        </View>
      )}
      {/* The school's colour reads on the bell too, as a hairline under it, so
          the header is branded even when there is nothing unread. */}
      <View style={{ height: 2, borderRadius: 1, backgroundColor: unread > 0 ? brand.primary : "transparent" }} />
    </Pressable>
  );
}

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand600,
    background: tone.surface,
    card: colors.white,
    text: tone.textPrimary,
    border: tone.border,
  },
};

function Tabs({ role }: { role: string }) {
  const brand = useBrand();
  /* An unrecognised role gets the tabs that need no role-specific endpoint.
     Falling back to the parent tabs would fetch /parent/children as a driver and
     show a permission error where a screen should be. */
  const tabs = TABS[role] ?? TABS.super_admin.slice(1);

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { fontWeight: "700", fontSize: 17, color: tone.textPrimary },
        headerShadowVisible: false,
        headerLeft: () => (
          <View style={{ paddingLeft: space(4) }}>
            <SchoolLogo size={28} />
          </View>
        ),
        headerRight: () => <AlertsBell />,
        tabBarActiveTintColor: brand.primary,
        tabBarInactiveTintColor: colors.slate400,
        // Labels always visible, and legible at a 130% font scale.
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: { borderTopColor: tone.border, height: 66, paddingTop: space(1.5), paddingBottom: space(2) },
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
      <View style={{ paddingVertical: space(12), alignItems: "center", gap: space(2.5) }}>
        <T role="heading">This is the wrong app</T>
        <Muted role="body" style={{ textAlign: "center" }}>
          {user?.name}, your account is a {user?.role.replace("_", " ")} account. Install {wanted} and sign in
          there instead.
        </Muted>
      </View>
      <Button variant="secondary" block onPress={signOut}>
        {str.common.signOut}
      </Button>
    </Screen>
  );
}

function SignedIn({ role }: { role: string }) {
  const extras = STACK_SCREENS[role] ?? [];

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { fontWeight: "700", fontSize: 17, color: tone.textPrimary },
        headerShadowVisible: false,
        headerTintColor: tone.textPrimary,
        contentStyle: { backgroundColor: tone.surface },
      }}
    >
      <Stack.Screen name="Tabs" options={{ headerShown: false }}>
        {() => <Tabs role={role} />}
      </Stack.Screen>

      {/* Reached from the header bell on any tab, and from a tapped push. */}
      <Stack.Screen name="Alerts" component={Alerts} options={{ title: str.nav.alerts }} />

      {/* Replayed from Profile — drivers change and phones get replaced. */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingReplay}
        options={{ title: str.profile.howItWorks }}
      />

      {extras.map((screen) => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={{ title: screen.title }}
        />
      ))}
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { user, ready, wrongApp } = useAuth();
  const intro = useOnboarded(INTRO_KEY);
  const roleIntro = useOnboarded(ROLE_KEY);
  const pending = useRef<string | null>(null);

  /* A tapped notification should land where the alert lives. Alerts is a stack
     screen for every role now, so this is one push rather than a routing table
     that has to know which tab index a role's Alerts sits at. */
  const openFromNotification = useCallback((_type: string) => {
    if (navRef.isReady()) navRef.navigate("Alerts" as never);
    else pending.current = "Alerts";
  }, []);
  useNotificationTaps(openFromNotification);

  // `seen` is null until storage answers. Flashing the welcome screen at a
  // signed-in driver for one frame would be worse than one more spinner.
  if (!ready || intro.seen === null || roleIntro.seen === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: tone.surface }}>
        <StatusBar style="dark" />
        <Loading />
      </View>
    );
  }

  if (!user) {
    if (!intro.seen) {
      return (
        <>
          <StatusBar style="dark" />
          <IntroOnboarding onDone={intro.complete} />
        </>
      );
    }
    return VARIANT === "parent" ? <ParentLogin /> : <StaffLogin />;
  }

  /* Branched after sign-in, not before: a driver and a school admin need
     entirely different things, and which one this is only becomes known once
     they have a session. For the driver this is where background location and
     the battery exemption get granted — before their first trip rather than
     during it. */
  if (!wrongApp && !roleIntro.seen) {
    return (
      <>
        <StatusBar style="dark" />
        <RoleOnboarding role={user.role} onDone={roleIntro.complete} />
      </>
    );
  }

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
      <UnreadProvider>{wrongApp ? <WrongApp /> : <SignedIn role={user.role} />}</UnreadProvider>
    </NavigationContainer>
  );
}
