import { AsyncLocalStorage } from "node:async_hooks";

export const ROLES = [
  "super_admin",
  "school_admin",
  "owner",
  "driver",
  "staff",
  "parent",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that operate inside exactly one school. */
export const SCHOOL_SCOPED_ROLES: Role[] = ["school_admin", "driver", "staff", "parent"];

export type RequestContext = {
  userId: string;
  role: Role;
  /** Absent for super_admin and owner, who are not bound to a single school. */
  schoolId?: string;
  /** Custom role (FRD 27), when the user has one. */
  roleId?: string;
  /**
   * Effective permissions, resolved at sign-in and carried in the token.
   *
   * undefined means "unrestricted for this role" — a school_admin with no custom
   * role owns their school outright. An empty array is a real, empty grant.
   */
  permissions?: string[];
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);
export const getContext = (): RequestContext | undefined => storage.getStore();

/** Throws rather than returning undefined — callers past auth always have one. */
export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("no request context — is authenticate() mounted?");
  return ctx;
}

export const currentUserId = (): string => requireContext().userId;
export const currentSchoolId = (): string | undefined => storage.getStore()?.schoolId;
