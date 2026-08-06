/*
 * Starts the dev server for one variant.
 *
 * `APP_VARIANT=staff expo start` works in bash and dies in cmd.exe, and npm runs
 * scripts through cmd.exe on Windows — which is what this project develops on.
 * Six lines here beats a cross-env dependency and a README caveat.
 */
const { spawn } = require("node:child_process");

const variant = process.argv[2] === "staff" ? "staff" : "parent";

spawn("npx", ["expo", "start", ...process.argv.slice(3)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, APP_VARIANT: variant },
}).on("exit", (code) => process.exit(code ?? 0));
