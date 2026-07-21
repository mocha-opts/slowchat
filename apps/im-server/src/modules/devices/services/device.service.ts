import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Device, Session } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { RealtimeEventPublisherService } from "../../../platform/realtime/realtime-event-publisher.service.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionEntity } from "../../auth/persistence/entities/auth-session.entity.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { toDevice, toSession } from "../device.mapper.js";
import { DeviceEntity } from "../persistence/entities/device.entity.js";

@Injectable()
export class DeviceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    private readonly realtime: RealtimeEventPublisherService,
  ) {}

  async listDevices(userId: string): Promise<Device[]> {
    const items = await this.dataSource.getRepository(DeviceEntity).find({
      where: { userId },
      order: { lastSeenAt: "DESC" },
    });
    return items.map(toDevice);
  }

  async listSessions(userId: string): Promise<Session[]> {
    const items = await this.dataSource.getRepository(AuthSessionEntity).find({
      where: { userId },
      order: { lastUsedAt: "DESC" },
    });
    return items.map(toSession);
  }

  async removeSession(context: AuthContext, sessionId: string): Promise<void> {
    const revoked = await this.dataSource.transaction(async (manager) => {
      const session = await manager.getRepository(AuthSessionEntity).findOneBy({
        id: sessionId,
        userId: context.userId,
      });
      if (!session) throw new AppError("NOT_FOUND", "Session was not found", 404);
      return this.sessions.revokeSession(manager, session.id, "SESSION_REMOVED");
    });
    if (revoked) await this.notify(revoked);
  }

  async removeDevice(context: AuthContext, deviceId: string): Promise<void> {
    const revoked = await this.dataSource.transaction(async (manager) => {
      const device = await manager.getRepository(DeviceEntity).findOneBy({
        id: deviceId,
        userId: context.userId,
      });
      if (!device) throw new AppError("DEVICE_NOT_FOUND", "Device was not found", 404);
      device.status = "REVOKED";
      device.revokedAt = new Date();
      await manager.getRepository(DeviceEntity).save(device);
      const active = await manager.getRepository(AuthSessionEntity).findBy({
        deviceId,
        userId: context.userId,
        status: "ACTIVE",
      });
      const result: AuthSessionEntity[] = [];
      for (const session of active) {
        const value = await this.sessions.revokeSession(manager, session.id, "DEVICE_REMOVED");
        if (value) result.push(value);
      }
      return result;
    });
    await Promise.all(revoked.map((session) => this.notify(session)));
  }

  private async notify(session: AuthSessionEntity): Promise<void> {
    await this.sessions.rememberRevocation(session.id, session.expiresAt);
    await this.realtime
      .revokeSession({
        sessionId: session.id,
        deviceId: session.deviceId,
        reason: session.revokedReason ?? "REVOKED",
      })
      .catch(() => undefined);
  }
}
