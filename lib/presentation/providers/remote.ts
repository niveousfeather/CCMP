import type { PresentationProvider } from "@/lib/presentation/types";

export function createRemotePresentationProvider(): PresentationProvider {
  return {
    name: "remote",
    async generate() {
      // Reserved for a future third-party AIPPT API integration.
      // The provider contract should remain stable: input deck/schema -> pptx buffer.
      throw new Error("REMOTE_PRESENTATION_PROVIDER_NOT_CONFIGURED");
    }
  };
}
