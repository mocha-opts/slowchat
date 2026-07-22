export interface VirusScannerPort {
  scan(input: {
    attachmentId: string;
    contentType: string;
    bytes: AsyncIterable<Uint8Array>;
  }): Promise<"CLEAN" | "INFECTED" | "UNKNOWN">;
}

export const VIRUS_SCANNER = Symbol("VIRUS_SCANNER");
