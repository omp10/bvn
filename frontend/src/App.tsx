import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { HOME, useAuth, type Role } from "./lib/auth";
import DeskShell, { type NavItem } from "./components/DeskShell";
import PhoneShell from "./components/PhoneShell";
import { Loading } from "./components/ui";
import {
  IconAlert, IconBell, IconBus, IconChart, IconClock, IconHome, IconMap,
  IconCheck, IconPin, IconPlus, IconRoute, IconSchool, IconShield, IconStudent,
  IconUser, IconUsers, IconWallet,
} from "./components/icons";

import Login from "./routes/Login";
import ParentLogin from "./routes/ParentLogin";
import ForgotPassword from "./routes/ForgotPassword";
import Register, { RegistrationStatus } from "./routes/Register";
import { AdminDashboard, AdminSchoolDetail, AdminSchools } from "./routes/admin/Admin";
import { AdminBilling, AdminReports, AdminVehicleRequests } from "./routes/admin/Billing";
import AdminOwners from "./routes/admin/Owners";
import AdminRegistrations, { AdminDriverRequests } from "./routes/admin/Registrations";
import { SchoolDashboard, SchoolLive } from "./routes/school/School";
import { SchoolBuses, SchoolPeople } from "./routes/school/Fleet";
import { SchoolStudents } from "./routes/school/Students";
import SchoolSalaries from "./routes/school/Salaries";
import SchoolStaffing from "./routes/school/Staffing";
import SchoolTrips from "./routes/school/Trips";
import { SchoolActivity, SchoolRoles } from "./routes/school/Roles";
import { SchoolAlerts, SchoolReports, SchoolRequests, SchoolRoutes } from "./routes/school/Ops";
import { FleetDashboard, FleetDrivers, FleetVehicles } from "./routes/fleet/Fleet";
import { DriverHistory, DriverToday } from "./routes/Driver";
import DriverLive from "./routes/DriverLive";
import Attendant from "./routes/Attendant";
import Profile from "./routes/Profile";
import { ParentAlerts, ParentHistory, ParentHome } from "./routes/Parent";

/* Each role owns its own URL space, so a link is always unambiguous about who
   it is for: /admin, /school, /fleet, /driver, /attendant, /parent. */

const NAV: Record<Role, NavItem[]> = {
  super_admin: [
    { to: "/admin", label: "Overview", icon: IconHome, end: true },
    { to: "/admin/schools", label: "Schools", icon: IconSchool },
    { to: "/admin/billing", label: "Subscriptions", icon: IconWallet },
    { to: "/admin/registrations", label: "Registrations", icon: IconCheck },
    { to: "/admin/owners", label: "Fleet owners", icon: IconUsers },
    { to: "/admin/requests", label: "Bus requests", icon: IconBus },
    { to: "/admin/driver-requests", label: "Driver requests", icon: IconUsers },
    { to: "/admin/reports", label: "Reports", icon: IconChart },
  ],
  school_admin: [
    { to: "/school", label: "Today", icon: IconHome, end: true },
    { to: "/school/live", label: "Live buses", icon: IconMap },
    { to: "/school/trips", label: "Trips & check-ins", icon: IconClock },
    { to: "/school/buses", label: "Buses", icon: IconBus },
    { to: "/school/drivers", label: "Drivers", icon: IconUsers },
    { to: "/school/attendants", label: "Attendants", icon: IconUsers },
    { to: "/school/routes", label: "Routes & stops", icon: IconRoute },
    { to: "/school/students", label: "Students", icon: IconStudent },
    { to: "/school/staffing", label: "Request buses/drivers", icon: IconPlus },
    { to: "/school/requests", label: "Route requests", icon: IconClock },
    { to: "/school/alerts", label: "Alerts", icon: IconAlert },
    { to: "/school/salaries", label: "Salaries", icon: IconWallet },
    { to: "/school/reports", label: "Reports", icon: IconChart },
    { to: "/school/roles", label: "Roles & staff", icon: IconShield },
    { to: "/school/activity", label: "Activity log", icon: IconClock },
  ],
  owner: [
    { to: "/fleet", label: "Overview", icon: IconHome, end: true },
    { to: "/fleet/vehicles", label: "Vehicles", icon: IconBus },
    { to: "/fleet/drivers", label: "Drivers", icon: IconUsers },
  ],
  driver: [
    { to: "/driver", label: "Trip", icon: IconBus, end: true },
    { to: "/driver/live", label: "Live", icon: IconMap },
    { to: "/driver/history", label: "History", icon: IconClock },
    { to: "/driver/profile", label: "Profile", icon: IconUser },
  ],
  staff: [
    { to: "/attendant", label: "Attendance", icon: IconUsers, end: true },
    { to: "/attendant/profile", label: "Profile", icon: IconUser },
  ],
  parent: [
    { to: "/parent", label: "Track", icon: IconPin, end: true },
    { to: "/parent/history", label: "History", icon: IconClock },
    { to: "/parent/alerts", label: "Alerts", icon: IconBell },
    { to: "/parent/profile", label: "Profile", icon: IconUser },
  ],
};

/** Roles that work at a desk get the sidebar; the rest get a phone layout. */
const DESK_ROLES: Role[] = ["super_admin", "school_admin", "owner"];

function Protected({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <Loading label="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Wrong role for this URL space — send them to their own home, not an error.
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;

  const Shell = DESK_ROLES.includes(role) ? DeskShell : PhoneShell;
  return <Shell nav={NAV[role]}>{children}</Shell>;
}

const guard = (role: Role, element: ReactNode) => <Protected role={role}>{element}</Protected>;

export default function App() {
  const { user, ready } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/parent/login" element={<ParentLogin />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {/* Public: schools, fleet owners and drivers apply to join. */}
      <Route path="/register" element={<Register />} />
      <Route path="/register/status" element={<RegistrationStatus />} />
      {/* Parents arriving from a QR code or invitation link. */}
      <Route path="/join/:code" element={<ParentLogin />} />

      {/* Platform admin */}
      <Route path="/admin" element={guard("super_admin", <AdminDashboard />)} />
      <Route path="/admin/schools" element={guard("super_admin", <AdminSchools />)} />
      <Route path="/admin/schools/:id" element={guard("super_admin", <AdminSchoolDetail />)} />
      <Route path="/admin/billing" element={guard("super_admin", <AdminBilling />)} />
      <Route path="/admin/registrations" element={guard("super_admin", <AdminRegistrations />)} />
      <Route path="/admin/driver-requests" element={guard("super_admin", <AdminDriverRequests />)} />
      <Route path="/admin/owners" element={guard("super_admin", <AdminOwners />)} />
      <Route path="/admin/requests" element={guard("super_admin", <AdminVehicleRequests />)} />
      <Route path="/admin/reports" element={guard("super_admin", <AdminReports />)} />

      {/* School office */}
      <Route path="/school" element={guard("school_admin", <SchoolDashboard />)} />
      <Route path="/school/live" element={guard("school_admin", <SchoolLive />)} />
      <Route path="/school/trips" element={guard("school_admin", <SchoolTrips />)} />
      <Route path="/school/buses" element={guard("school_admin", <SchoolBuses />)} />
      <Route path="/school/drivers" element={guard("school_admin", <SchoolPeople kind="drivers" />)} />
      <Route path="/school/attendants" element={guard("school_admin", <SchoolPeople kind="attendants" />)} />
      <Route path="/school/routes" element={guard("school_admin", <SchoolRoutes />)} />
      <Route path="/school/students" element={guard("school_admin", <SchoolStudents />)} />
      <Route path="/school/staffing" element={guard("school_admin", <SchoolStaffing />)} />
      <Route path="/school/requests" element={guard("school_admin", <SchoolRequests />)} />
      <Route path="/school/alerts" element={guard("school_admin", <SchoolAlerts />)} />
      <Route path="/school/salaries" element={guard("school_admin", <SchoolSalaries />)} />
      <Route path="/school/reports" element={guard("school_admin", <SchoolReports />)} />
      <Route path="/school/roles" element={guard("school_admin", <SchoolRoles />)} />
      <Route path="/school/activity" element={guard("school_admin", <SchoolActivity />)} />

      {/* Fleet owner */}
      <Route path="/fleet" element={guard("owner", <FleetDashboard />)} />
      <Route path="/fleet/vehicles" element={guard("owner", <FleetVehicles />)} />
      <Route path="/fleet/drivers" element={guard("owner", <FleetDrivers />)} />

      {/* On the bus */}
      <Route path="/driver" element={guard("driver", <DriverToday />)} />
      <Route path="/driver/live" element={guard("driver", <DriverLive />)} />
      <Route path="/driver/history" element={guard("driver", <DriverHistory />)} />
      <Route path="/driver/profile" element={guard("driver", <Profile />)} />
      <Route path="/attendant" element={guard("staff", <Attendant />)} />
      <Route path="/attendant/profile" element={guard("staff", <Profile />)} />

      {/* At home */}
      <Route path="/parent" element={guard("parent", <ParentHome />)} />
      <Route path="/parent/history" element={guard("parent", <ParentHistory />)} />
      <Route path="/parent/alerts" element={guard("parent", <ParentAlerts />)} />
      <Route path="/parent/profile" element={guard("parent", <Profile />)} />

      <Route
        path="*"
        element={!ready ? <Loading /> : <Navigate to={user ? HOME[user.role] : "/login"} replace />}
      />
    </Routes>
  );
}
