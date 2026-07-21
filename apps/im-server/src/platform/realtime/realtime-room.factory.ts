import { Injectable } from "@nestjs/common";

@Injectable()
export class RealtimeRoomFactory {
  user(userId: string): string {
    return `user:${userId}`;
  }

  device(deviceId: string): string {
    return `device:${deviceId}`;
  }

  session(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
