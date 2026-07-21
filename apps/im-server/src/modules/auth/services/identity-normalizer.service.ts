import { Injectable } from "@nestjs/common";
import type { Identity } from "@im/contracts/api";

import { AppError } from "../../../common/errors/app-error.js";

@Injectable()
export class IdentityNormalizerService {
  normalize(identity: Identity): Identity {
    if (identity.type === "PHONE") {
      const value = identity.value.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(value)) {
        throw new AppError("VALIDATION_ERROR", "Phone number must use E.164 format", 400);
      }
      return { type: "PHONE", value };
    }
    const value = identity.value.trim().toLowerCase();
    return { type: "EMAIL", value };
  }
}
