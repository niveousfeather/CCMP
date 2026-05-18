import { VideoGenerationPage } from "@/components/video-generation/video-page";

export default async function VideoPage({ searchParams }: { searchParams?: Promise<{ taskId?: string }> }) {
  const params = await searchParams;
  return <VideoGenerationPage initialTaskId={params?.taskId || null} />;
}
