import {
  findAvailablePort,
  loadDevelopmentEnvironment,
  runCommand,
  spawnCommand,
  waitForExit,
  waitForHealth,
  waitForHttpStatus,
  waitForProcessHealth,
} from "./process-utils.mjs";

loadDevelopmentEnvironment();

const infrastructure = spawnCommand("pnpm", ["infra:up"]);
const infrastructureResult = await waitForExit(infrastructure);
if (infrastructureResult.code !== 0) process.exit(infrastructureResult.code ?? 1);

const build = spawnCommand("pnpm", ["build"]);
const buildResult = await waitForExit(build);
if (buildResult.code !== 0) process.exit(buildResult.code ?? 1);

const smokePorts = await Promise.all(Array.from({ length: 4 }, () => findAvailablePort()));
const [apiPort, realtimePort, eventWorkerPort, jobWorkerPort] = smokePorts;
Object.assign(process.env, {
  API_PORT: String(apiPort),
  REALTIME_PORT: String(realtimePort),
  EVENT_WORKER_PORT: String(eventWorkerPort),
  JOB_WORKER_PORT: String(jobWorkerPort),
});

const processes = [
  ["api", "apps/im-server/dist/entrypoints/api.main.js", apiPort],
  ["realtime", "apps/im-server/dist/entrypoints/realtime.main.js", realtimePort],
  ["event-worker", "apps/im-server/dist/entrypoints/event-worker.main.js", eventWorkerPort],
  ["job-worker", "apps/im-server/dist/entrypoints/job-worker.main.js", jobWorkerPort],
].map(([name, entrypoint, port]) => ({
  name,
  port,
  child: spawnCommand("node", [entrypoint]),
}));
let redisJobsStopped = false;

try {
  await Promise.all(
    processes.flatMap(({ child, port }) => [
      waitForProcessHealth(child, `http://127.0.0.1:${port}/health/live`),
      waitForProcessHealth(child, `http://127.0.0.1:${port}/health/ready`),
    ]),
  );

  await runCommand("docker", ["compose", "-f", "deploy/docker/compose.yml", "stop", "redis-jobs"]);
  redisJobsStopped = true;
  await waitForHttpStatus(`http://127.0.0.1:${jobWorkerPort}/health/ready`, 503);
  await waitForHealth(`http://127.0.0.1:${jobWorkerPort}/health/live`);
  await Promise.all(
    [apiPort, realtimePort, eventWorkerPort].map((port) =>
      waitForHealth(`http://127.0.0.1:${port}/health/ready`),
    ),
  );
  await runCommand("docker", ["compose", "-f", "deploy/docker/compose.yml", "start", "redis-jobs"]);
  redisJobsStopped = false;
  await waitForHealth(`http://127.0.0.1:${jobWorkerPort}/health/ready`);

  const exitPromises = processes.map(({ child }) => waitForExit(child));
  for (const processInfo of processes) processInfo.child.kill("SIGTERM");
  const exits = await Promise.all(exitPromises);
  if (exits.some(({ code }) => code !== 0)) throw new Error("A process did not shut down cleanly");
  console.log("P1 smoke test passed");
} finally {
  for (const processInfo of processes) {
    if (processInfo.child.exitCode === null) processInfo.child.kill("SIGKILL");
  }
  if (redisJobsStopped) {
    await runCommand("docker", [
      "compose",
      "-f",
      "deploy/docker/compose.yml",
      "start",
      "redis-jobs",
    ]);
  }
}
