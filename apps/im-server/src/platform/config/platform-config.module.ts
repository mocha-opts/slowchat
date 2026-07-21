import { Global, Module, type DynamicModule } from "@nestjs/common";

import { APP_CONFIG, PROCESS_KIND, type ProcessKind } from "./app-config.js";
import { loadAppConfig } from "./config-loader.js";

@Global()
@Module({})
export class PlatformConfigModule {
  static forProcess(processKind: ProcessKind): DynamicModule {
    return {
      module: PlatformConfigModule,
      global: true,
      providers: [
        { provide: PROCESS_KIND, useValue: processKind },
        { provide: APP_CONFIG, useFactory: () => loadAppConfig(processKind) },
      ],
      exports: [APP_CONFIG, PROCESS_KIND],
    };
  }
}
