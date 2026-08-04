import { isSchoolOperational, School } from "../../models/school.model.js";
import { Role } from "../../models/role.model.js";
import { expandPermissions } from "../../lib/permissions.js";
import { User } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { forbidden, unauthorized } from "../../lib/errors.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { uuid } from "../../lib/codes.js";
import type { Role as RoleName } from "../../lib/context.js";

/** Keeps the last N devices signed in; older refresh tokens fall out. */
const MAX_SESSIONS = 5;

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof publicUser>;
  school: ReturnType<typeof publicSchool> | null;
};

/** undefined = unrestricted; an array = exactly these permissions. */
export async function permissionsFor(user: { role: string; roleId?: unknown }) {
  if (user.role !== "school_admin" || !user.roleId) return undefined;

  const role = await allSchools(Role.findById(user.roleId));
  // A deactivated or deleted role must never fall back to full access.
  if (!role || !role.active) return [];
  return expandPermissions(role.permissions);
}

export const publicUser = (user: {
  _id: unknown; name: string; phone: string; role: RoleName; schoolId?: unknown; roleId?: unknown;
}) => ({
  id: String(user._id),
  name: user.name,
  phone: user.phone,
  role: user.role,
  schoolId: user.schoolId ? String(user.schoolId) : null,
  roleId: user.roleId ? String(user.roleId) : null,
});

export const publicSchool = (school: {
  _id: unknown; name: string; code: string; status: string; branding?: Record<string, unknown>;
}) => ({
  id: String(school._id),
  name: school.name,
  code: school.code,
  status: school.status,
  themeColor: (school.branding?.themeColor as string) ?? "#1d4ed8",
  logoUrl: (school.branding?.logoUrl as string) ?? null,
  appName: (school.branding?.appName as string) ?? school.name,
});

/**
 * Business rule: a school with no live subscription cannot be used, so its
 * users are refused at the door rather than half-way through a screen.
 */
export async function assertSchoolOperational(schoolId: unknown) {
  if (!schoolId) return null; // super admin and fleet owners are not school-bound

  const school = await School.findById(schoolId);
  if (!school) throw forbidden("school not found");
  if (!isSchoolOperational(school)) {
    throw forbidden(
      school.status === "suspended" ? "school account suspended" : "school subscription expired"
    );
  }
  return school;
}

/** Issues the token pair and records the session so it can be revoked. */
export async function issueSession(userId: unknown): Promise<AuthResult> {
  const user = await allSchools(User.findById(userId)).select("+sessions");
  if (!user) throw unauthorized("account not found");
  if (user.status === "inactive") throw forbidden("account disabled");

  const school = await assertSchoolOperational(user.schoolId);

  const jti = uuid();
  const sessions = [...(user.sessions ?? []), jti].slice(-MAX_SESSIONS);
  await allSchools(User.updateOne({ _id: user._id }, { sessions, lastLoginAt: new Date() }));

  return {
    accessToken: signAccessToken({
      userId: String(user._id),
      role: user.role as RoleName,
      schoolId: user.schoolId ? String(user.schoolId) : undefined,
      roleId: user.roleId ? String(user.roleId) : undefined,
      // Resolved once at sign-in rather than read on every request. A permission
      // change therefore applies on the user's next token refresh (≤15 min), or
      // at once if the office signs them out — which the role screen offers.
      permissions: await permissionsFor(user),
    }),
    refreshToken: signRefreshToken(String(user._id), jti),
    user: publicUser(user as never),
    school: school ? publicSchool(school as never) : null,
  };
}

/** Rotates the refresh token so a stolen one cannot be replayed after use. */
export async function rotateSession(userId: string, jti: string): Promise<AuthResult> {
  const user = await allSchools(User.findById(userId)).select("+sessions");
  if (!user) throw unauthorized("account not found");
  // Absent jti means the session was revoked by a sign-out, or already rotated.
  if (!user.sessions?.includes(jti)) throw unauthorized("session expired, sign in again");

  await allSchools(User.updateOne({ _id: userId }, { $pull: { sessions: jti } }));
  return issueSession(userId);
}

export async function revokeSession(userId: string, jti?: string): Promise<void> {
  await allSchools(
    User.updateOne({ _id: userId }, jti ? { $pull: { sessions: jti } } : { sessions: [] })
  );
}
