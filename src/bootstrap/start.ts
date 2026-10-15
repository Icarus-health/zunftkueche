export const MICROSOFT_ENVIRONMENT_ID = "5684204c-3254-ec15-93f4-276ec50cc65b";
export const MICROSOFT_WORKSPACE_ID = "45deaf94-5661-4110-8f16-3d2678c09f04";

export function usesMicrosoft(development: boolean, mode: string): boolean {
  return !development || mode === "microsoft";
}

interface BootstrapSteps {
  connectMicrosoft: () => Promise<void>;
  mount: () => Promise<void>;
  showError: () => void;
}

// Never mount the working app after a failed Microsoft bootstrap.
export async function startApplication(
  microsoft: boolean,
  steps: BootstrapSteps,
): Promise<void> {
  try {
    if (microsoft) await steps.connectMicrosoft();
    await steps.mount();
  } catch {
    steps.showError();
  }
}

export async function requireMicrosoftContext(
  getContext: () => Promise<{ app: { environmentId: string } }>,
  timeoutMs = 15000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const context = await Promise.race([
      getContext(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Microsoft-Startzeit überschritten.")), timeoutMs);
      }),
    ]);
    if (context?.app?.environmentId?.toLowerCase() !== MICROSOFT_ENVIRONMENT_ID) {
      throw new Error("Microsoft-Umgebung stimmt nicht überein.");
    }
  } finally {
    clearTimeout(timer);
  }
}
