import { getContext } from "@microsoft/power-apps/app";
import { configureMicrosoftRuntime } from "../data/microsoft-runtime.ts";
import { MICROSOFT_WORKSPACE_ID, requireMicrosoftContext } from "./start.ts";

export async function connectMicrosoft(): Promise<void> {
  await requireMicrosoftContext(getContext);
  // Generated services create their SDK clients on import; wait for the host first.
  const [{ Zk_KitchenLoadService }, { Zk_KitchenCommitService }] = await Promise.all([
    import("../generated/services/Zk_KitchenLoadService"),
    import("../generated/services/Zk_KitchenCommitService"),
  ]);
  configureMicrosoftRuntime(MICROSOFT_WORKSPACE_ID, {
    load: Zk_KitchenLoadService,
    commit: Zk_KitchenCommitService,
  });
}
