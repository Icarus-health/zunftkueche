import fs from "node:fs/promises";
import path from "node:path";
import { applyOperation } from "../src/domain/state.ts";
import type {
  KitchenState,
  Operation,
  CommitResult,
} from "../src/domain/state.ts";
export function createLocalStore(
  file: string,
  seed: KitchenState,
): {
  load: () => Promise<KitchenState>;
  commit: (op: Operation) => Promise<CommitResult>;
} {
  let queue: Promise<unknown> = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as {
        state: KitchenState;
        journal: Operation[];
      };
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      return {
        state: { ...structuredClone(seed), revision: 0, operationIds: [] },
        journal: [],
      };
    }
  }
  return {
    load: async () => structuredClone((await read()).state),
    commit: (op) => {
      const task = queue.then(async () => {
        const current = await read(),
          result = applyOperation(current.state, op);
        if (
          result.status === "saved" &&
          result.state.revision !== current.state.revision
        ) {
          await fs.mkdir(path.dirname(file), { recursive: true });
          const temporary =
            file + "." + op.id.replace(/[^a-zA-Z0-9-]/g, "") + ".tmp";
          const handle = await fs.open(temporary, "wx", 0o600);
          try {
            await handle.writeFile(
              JSON.stringify({
                state: result.state,
                journal: [...current.journal, op],
              }),
            );
            await handle.sync();
          } finally {
            await handle.close();
          }
          await fs.rename(temporary, file);
        }
        return result;
      });
      queue = task.catch(() => undefined);
      return task;
    },
  };
}
