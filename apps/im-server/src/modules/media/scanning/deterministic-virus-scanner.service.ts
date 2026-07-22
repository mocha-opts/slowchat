import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import type { VirusScannerPort } from "./virus-scanner.port.js";

/**
 * 开发/测试扫描器只识别 EICAR 字符串，便于在没有外部杀毒服务时稳定测试隔离状态。
 * 生产环境配置为 required 后由部署层替换该 Port，不能把此实现当成真实杀毒能力。
 */
@Injectable()
export class DeterministicVirusScannerService implements VirusScannerPort {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async scan(input: {
    attachmentId: string;
    contentType: string;
    bytes: AsyncIterable<Uint8Array>;
  }): Promise<"CLEAN" | "INFECTED" | "UNKNOWN"> {
    if (this.config.media.scannerMode === "required") return "UNKNOWN";
    const decoder = new TextDecoder();
    let content = "";
    for await (const chunk of input.bytes) {
      content += decoder.decode(chunk, { stream: true });
      if (content.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) return "INFECTED";
      if (content.length > 1024 * 1024) break;
    }
    return "CLEAN";
  }
}
