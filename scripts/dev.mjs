import { spawnCommand, loadDevelopmentEnvironment } from "./process-utils.mjs";

loadDevelopmentEnvironment();

const infrastructure = spawnCommand("pnpm", ["infra:up"]);
const infrastructureResult = await new Promise((resolvePromise) => {
  infrastructure.once("exit", (code) => resolvePromise(code));
});
if (infrastructureResult !== 0) process.exit(infrastructureResult ?? 1);

const scripts = ["dev:api", "dev:realtime", "dev:event-worker", "dev:job-worker"];
const children = scripts.map((script) => spawnCommand("pnpm", [script]));

const stop = (signal) => {
  for (const child of children) child.kill(signal);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const result = await Promise.race(
  children.map(
    (child) =>
      new Promise((resolvePromise) => child.once("exit", (code) => resolvePromise(code ?? 1))),
  ),
);
stop("SIGTERM");
process.exitCode = result;
