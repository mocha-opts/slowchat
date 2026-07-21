import type { Device, Session } from "@im/contracts/api";

import type { AuthSessionEntity } from "../auth/persistence/entities/auth-session.entity.js";
import type { DeviceEntity } from "./persistence/entities/device.entity.js";

export function toDevice(device: DeviceEntity): Device {
  return {
    id: device.id,
    clientDeviceId: device.clientDeviceId,
    platform: device.platform as Device["platform"],
    name: device.name,
    appVersion: device.appVersion,
    status: device.status as Device["status"],
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

export function toSession(session: AuthSessionEntity): Session {
  return {
    id: session.id,
    deviceId: session.deviceId,
    status: session.status as Session["status"],
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}
