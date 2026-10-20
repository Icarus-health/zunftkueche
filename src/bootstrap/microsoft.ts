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
  const services = {
    load: Zk_KitchenLoadService,
    commit: Zk_KitchenCommitService,
  };
  const repo=configureMicrosoftRuntime(MICROSOFT_WORKSPACE_ID,services);
  const load=repo.load.bind(repo);
  let generation=0;
  repo.load=async()=>{
    const current=++generation;
    const state=await load();
    if(repo.features?.documents!==true)return state;
    const identity=JSON.stringify(repo.identity);
    const [{SharePointService},{createSharePointProvider},{connectDocumentRepository}]=await Promise.all([
      import("../generated/services/SharePointService"),import("../data/sharepoint-documents.ts"),import("../data/document-runtime.ts")
    ]);
    if(current===generation && repo.features?.documents===true && JSON.stringify(repo.identity)===identity)
      connectDocumentRepository(repo,services,createSharePointProvider(SharePointService,getContext),sessionStorage);
    return state;
  };
}
