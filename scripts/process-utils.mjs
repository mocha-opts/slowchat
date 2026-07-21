import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";

export const rootDirectory = resolve(import.meta.dirname, "..");

export function loadDevelopmentEnvironment() {
  ensureDevelopmentAuthKeys();
  const environmentFile = existsSync(resolve(rootDirectory, ".env")) ? ".env" : ".env.example";
  process.loadEnvFile(resolve(rootDirectory, environmentFile));
}

export function ensureDevelopmentAuthKeys() {
  const keyDirectory = resolve(rootDirectory, ".local/auth");
  const privateKeyPath = resolve(keyDirectory, "private.pem");
  const publicKeyPath = resolve(keyDirectory, "public.pem");
  if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) return;
  mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
}

export function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDirectory,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
}

export async function waitForHealth(url, timeoutMs = 60_000) {
  return waitForHttpStatus(url, 200, timeoutMs);
}

export async function waitForHttpStatus(url, expectedStatus, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === expectedStatus) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for ${url}`, { cause: lastError });
}

export async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Unable to allocate an available TCP port");
  }
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error === undefined ? resolvePromise() : reject(error))),
  );
  return address.port;
}

export async function waitForProcessHealth(child, url, timeoutMs = 60_000) {
  return Promise.race([
    waitForHealth(url, timeoutMs),
    waitForExit(child).then(({ code, signal }) => {
      throw new Error(
        `Process exited before ${url} became healthy (code=${code}, signal=${signal})`,
      );
    }),
  ]);
}

export async function runCommand(command, args) {
  const result = await waitForExit(spawnCommand(command, args));
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (code=${result.code})`);
  }
}

export function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
}
