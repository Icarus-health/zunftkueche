import type { IOperationResult } from "@microsoft/power-apps/data";
import { createMicrosoftRepository } from "./microsoft-repository.ts";
import type { PendingStore } from "./microsoft-repository.ts";
import type { Repository } from "./repository.ts";
// Actual generated services own getClient(dataSourcesInfo) and Dataverse routing.
export interface KitchenGeneratedServices {
  load: {
    zk_KitchenLoad: (
      RequestJson: string,
    ) => Promise<IOperationResult<{ ResultJson?: string }>>;
  };
  commit: {
    zk_KitchenCommit: (
      RequestJson: string,
    ) => Promise<IOperationResult<{ ResultJson?: string }>>;
  };
}
let configured: Repository | undefined;
export function configureMicrosoftRuntime(
  workspaceId: string,
  services: KitchenGeneratedServices,
  pendingStore?: PendingStore,
): Repository {
  if (configured)
    throw new Error("Microsoft-Verbindung ist bereits initialisiert.");
  const store =
    pendingStore ??
    (typeof sessionStorage === "undefined" ? undefined : sessionStorage);
  if (!store)
    throw new Error(
      "Sicherer Speicher für offene Änderungen ist nicht verfügbar.",
    );
  configured = createMicrosoftRepository(
    {
      load: (q) => services.load.zk_KitchenLoad(q),
      commit: (q) => services.commit.zk_KitchenCommit(q),
    },
    workspaceId,
    store,
  );
  return configured;
}
export function getMicrosoftRepository(): Repository | undefined {
  return configured;
}
