import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { dateTime, titleCase } from "../../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table, cx,
} from "../../components/ui";
import { IconPlus, IconShield } from "../../components/icons";

type Module = { key: string; label: string; actions: string[] };
type Role = {
  _id: string; name: string; description?: string; permissions: string[];
  system: boolean; active: boolean; userCount: number;
};
type Staff = {
  _id: string; name: string; phone: string; status: string;
  roleId?: { _id: string; name: string } | null;
};

export function SchoolRoles() {
  const catalogue = useQuery<{ modules: Module[] }>("/school/roles/permissions");
  const roles = useQuery<Role[]>("/school/roles");
  const staff = useQuery<Staff[]>("/school/roles/staff/accounts");
  const { busy, error, run } = useAction();

  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);

  return (
    <>
      <PageHeader
        title="Roles & staff accounts"
        subtitle="Give office staff exactly the access they need, and nothing else."
        actions={<Button onClick={() => setEditing("new")}><IconPlus className="h-4 w-4" /> New role</Button>}
      />
      <Alert>{error}</Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.data?.map((role) => (
          <Card
            key={role._id}
            title={
              <span className="flex items-center gap-2">
                {role.name}
                {role.system && <Badge value="active">Built-in</Badge>}
                {!role.active && <Badge value="suspended">Disabled</Badge>}
              </span>
            }
            subtitle={role.description}
            actions={
              !role.system && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(role)}>Edit</Button>
              )
            }
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {catalogue.data?.modules.map((module) => {
                const canManage = role.permissions.includes(`${module.key}:manage`);
                const canView = role.permissions.includes(`${module.key}:view`);
                if (!canView && !canManage) return null;
                return (
                  <span
                    key={module.key}
                    className={cx(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      canManage ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {module.label}
                    {canManage ? " · edit" : " · view"}
                  </span>
                );
              })}
              {role.permissions.length === 0 && <span className="text-sm text-slate-400">No access granted.</span>}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">
                {role.userCount} staff account{role.userCount === 1 ? "" : "s"}
              </span>
              {role.userCount > 0 && !role.system && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/school/roles/${role._id}/revoke-sessions`, { body: {} }), roles.reload)
                  }
                  className="text-xs font-semibold text-slate-500 hover:text-red-600"
                >
                  Sign them all out
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card
        className="mt-4"
        title="Staff accounts"
        subtitle="Office logins. A staff member with no role has full access to this school."
        actions={<Button size="sm" onClick={() => setAddingStaff(true)}><IconPlus className="h-4 w-4" /> Add account</Button>}
        padded={false}
      >
        <Table
          rows={staff.data}
          loading={staff.loading}
          rowKey={(s) => s._id}
          empty={<EmptyState title="No staff accounts yet" />}
          columns={[
            {
              header: "Name",
              cell: (s) => (
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} />
                  <div>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.phone}</div>
                  </div>
                </div>
              ),
            },
            {
              header: "Role",
              cell: (s) => (
                <Select
                  value={s.roleId?._id ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    void run(
                      () =>
                        api(`/school/roles/staff/accounts/${s._id}`, {
                          method: "PATCH",
                          body: { roleId: e.target.value || null },
                        }),
                      staff.reload
                    )
                  }
                  className="[&_select]:h-8 [&_select]:text-xs"
                >
                  <option value="">Full access (no role)</option>
                  {roles.data?.filter((r) => r.active).map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </Select>
              ),
            },
            { header: "Status", align: "right", cell: (s) => <Badge value={s.status} /> },
          ]}
        />
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Changing a role signs that person out, so the new permissions apply immediately.
        </p>
      </Card>

      {editing && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          modules={catalogue.data?.modules ?? []}
          onClose={() => setEditing(null)}
          onDone={() => { roles.reload(); staff.reload(); }}
        />
      )}

      <AddStaff
        open={addingStaff}
        roles={roles.data ?? []}
        onClose={() => setAddingStaff(false)}
        onDone={staff.reload}
      />
    </>
  );
}

function RoleEditor({
  role, modules, onClose, onDone,
}: { role: Role | null; modules: Module[]; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [granted, setGranted] = useState<Set<string>>(new Set(role?.permissions ?? []));

  /**
   * The matrix is three-state per module: none, view, edit. "Edit" implies
   * "view", so the two are never presented as independent tick boxes — that
   * combination only ever produces support tickets.
   */
  const levelOf = (key: string) =>
    granted.has(`${key}:manage`) ? "manage" : granted.has(`${key}:view`) ? "view" : "none";

  const setLevel = (module: Module, level: string) => {
    const next = new Set(granted);
    next.delete(`${module.key}:view`);
    next.delete(`${module.key}:manage`);
    if (level === "view") next.add(`${module.key}:view`);
    if (level === "manage") {
      next.add(`${module.key}:manage`);
      next.add(`${module.key}:view`);
    }
    setGranted(next);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : "New role"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!name.trim()}
            onClick={() =>
              void run(
                () =>
                  api(role ? `/school/roles/${role._id}` : "/school/roles", {
                    method: role ? "PATCH" : "POST",
                    body: { name, description: description || undefined, permissions: [...granted] },
                  }),
                () => { onDone(); onClose(); }
              )
            }
          >
            Save role
          </Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <div className="space-y-4">
        <Field label="Role name" placeholder="Transport Coordinator" value={name}
          onChange={(e) => setName(e.target.value)} autoFocus />
        <Field label="Description" placeholder="What this role is for" value={description}
          onChange={(e) => setDescription(e.target.value)} />

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">What can this role do?</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {modules.map((module) => {
              const level = levelOf(module.key);
              const canManage = module.actions.includes("manage");
              return (
                <div key={module.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-700">{module.label}</span>
                  <div className="flex overflow-hidden rounded-md border border-slate-200">
                    {(["none", "view", ...(canManage ? ["manage"] : [])] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLevel(module, option)}
                        className={cx(
                          "px-2.5 py-1 text-xs font-medium transition",
                          level === option
                            ? option === "none"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-brand-600 text-white"
                            : "bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {option === "manage" ? "Edit" : titleCase(option)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            "Edit" includes viewing. Anything set to "None" is hidden and refused by the server, not just the screen.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function AddStaff({
  open, roles, onClose, onDone,
}: { open: boolean; roles: Role[]; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title="Add a staff account">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api("/school/roles/staff/accounts", {
                body: {
                  name: form.name,
                  phone: form.phone,
                  password: form.password,
                  roleId: form.roleId || undefined,
                },
              }),
            () => { setForm({}); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Full name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile number" inputMode="numeric" value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required />
          <Field label="Password" type="password" value={form.password ?? ""} onChange={set("password")} required />
        </div>
        <Select label="Role" value={form.roleId ?? ""} onChange={set("roleId")}>
          <option value="">Full access (no role)</option>
          {roles.filter((r) => r.active).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create account</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Activity log (FRD 27) ──────────────────────────────────────────── */

export function SchoolActivity() {
  const { data, loading } = useQuery<{ items: any[]; total: number }>("/school/activity?limit=100");

  return (
    <>
      <PageHeader title="Activity log" subtitle="Every administrative change, with who made it." />
      <Card padded={false}>
        <Table
          rows={data?.items}
          loading={loading}
          rowKey={(a) => a._id}
          empty={<EmptyState title="Nothing logged yet" hint="Administrative changes appear here as they happen." />}
          columns={[
            {
              header: "Who",
              cell: (a) => (
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500">
                    <IconShield className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{a.actorId?.name ?? "System"}</div>
                    <div className="text-xs capitalize text-slate-500">{a.actorRole?.replace("_", " ")}</div>
                  </div>
                </div>
              ),
            },
            {
              header: "Action",
              cell: (a) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</code>,
            },
            { header: "On", cell: (a) => a.entity, secondary: true },
            { header: "When", align: "right", cell: (a) => dateTime(a.createdAt) },
          ]}
        />
      </Card>
    </>
  );
}
