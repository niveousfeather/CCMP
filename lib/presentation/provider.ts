import { createLocalPresentationProvider } from "@/lib/presentation/providers/local";
import { createRemotePresentationProvider } from "@/lib/presentation/providers/remote";
import type { PresentationProvider } from "@/lib/presentation/types";

export function getPresentationProvider(): PresentationProvider {
  if (process.env.PRESENTATION_PROVIDER === "remote") {
    return createRemotePresentationProvider();
  }

  return createLocalPresentationProvider();
}
