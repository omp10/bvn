/*
 * Starts the dev server for one variant.
 *
 * `APP_VARIANT=staff expo start` works in bash and dies in cmd.exe, and npm runs
 * scripts through cmd.exe on Windows — which is what this project develops on.
 * Six lines here beats a cross-env dependency and a README caveat.
 */
const { spawn } = require("node:child_process");

const variant = process.argv[2] === "staff" ? "staff" : "parent";

/*
 * Which API the bundle points at.
 *
 * `app.config.js` falls back to http://10.0.2.2:4000, which is the Android
 * *emulator's* alias for this machine's localhost. On a real phone it resolves
 * to nothing, and the app refuses cleartext anyway, so every request fails
 * before it leaves the device and the app looks like the server is down.
 *
 * A debug build carries no JS — every reload pulls a fresh bundle from here —
 * so this is the process whose environment decides it, not the one that ran
 * Gradle. Defaulting it to production means `npm start` reaches a working
 * backend with nothing to remember. Point it somewhere else when you are
 * running the backend locally:
 *
 *   EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 npm start
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL || "https://balvahini.com";

console.log(`\n  ${variant} app → ${apiUrl}\n`);

spawn("npx", ["expo", "start", ...process.argv.slice(3)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, APP_VARIANT: variant, EXPO_PUBLIC_API_URL: apiUrl },
}).on("exit", (code) => process.exit(code ?? 0));
