/**
 * The permission catalogue (FRD 27).
 *
 * One entry per screen a school-side user can reach, with the actions that
 * screen supports. This list is the single source of truth: the role editor
 * renders from it, and requirePermission() checks against it.
 */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "live", label: "Live tracking", actions: ["view"] },
  { key: "buses", label: "Buses", actions: ["view", "manage"] },
  { key: "drivers", label: "Drivers", actions: ["view", "manage"] },
  { key: "attendants", label: "Attendants", actions: ["view", "manage"] },
  { key: "routes", label: "Routes & stops", actions: ["view", "manage"] },
  { key: "students", label: "Students", actions: ["view", "manage"] },
  { key: "parents", label: "Parents", actions: ["view", "manage"] },
  { key: "requests", label: "Route change requests", actions: ["view", "manage"] },
  { key: "alerts", label: "Emergency alerts", actions: ["view", "manage"] },
  { key: "salaries", label: "Salaries", actions: ["view", "manage"] },
  { key: "reports", label: "Reports", actions: ["view"] },
  { key: "billing", label: "Subscription & billing", actions: ["view", "manage"] },
  { key: "roles", label: "Roles & staff accounts", actions: ["view", "manage"] },
  { key: "activity", label: "Activity log", actions: ["view"] },
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number]["key"];

/** e.g. "students:manage" */
export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((action) => `${m.key}:${action}`)
);

export const isPermission = (value: string): boolean => ALL_PERMISSIONS.includes(value);

/**
 * "manage" implies "view" — nobody should have to tick both, and a role that
 * can edit students but not see them is a support ticket waiting to happen.
 */
export function expandPermissions(granted: string[]): string[] {
  const out = new Set<string>();
  for (const permission of granted) {
    if (!isPermission(permission)) continue;
    out.add(permission);
    const [module, action] = permission.split(":");
    if (action === "manage") out.add(`${module}:view`);
  }
  return [...out];
}

/** A sensible starting point when someone creates a role from scratch. */
export const READ_ONLY_PRESET = PERMISSION_MODULES.filter((m) =>
  (m.actions as readonly string[]).includes("view")
).map((m) => `${m.key}:view`);

export const hasPermission = (permissions: string[] | undefined, required: string): boolean =>
  Array.isArray(permissions) && permissions.includes(required);
