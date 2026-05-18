import { ArrowRight, Bot, Box, Image, Video, WandSparkles } from "lucide-react";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { HomeCarousel } from "@/components/home/home-carousel";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const capabilityCards = [
  {
    title: "Nexus Image2",
    desc: "高质量图片生成与参考图创作，适合快速制作视觉效果图和成品素材。",
    href: "/image",
    icon: Image,
    tone: "from-blue-500 to-cyan-400"
  },
  {
    title: "视频生成",
    desc: "基于提示词和参考图的智能视频生成，统一预览、剪辑与生成记录。",
    href: "/video",
    icon: Video,
    tone: "from-blue-600 to-indigo-500"
  },
  {
    title: "Nexus 3D",
    desc: "模型生成、纹理、PBR、动画与 3D 场景搭建，一站式 3D 工作流。",
    href: "/model3d",
    icon: Box,
    tone: "from-cyan-500 to-blue-600"
  },
  {
    title: "智能对话",
    desc: "统一对话、写作、知识整理与数据分析，让团队更高效地协同创作。",
    href: "/chat",
    icon: Bot,
    tone: "from-sky-500 to-blue-500"
  }
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#f6f9ff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(37,99,235,0.035)_1px,transparent_1px),linear-gradient(rgba(37,99,235,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute left-1/2 top-14 h-[560px] w-[960px] -translate-x-1/2 rounded-full bg-blue-200/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-white to-transparent" />

      <header className="relative z-20 border-b border-blue-100/80 bg-white/82 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-5 md:px-10">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button size="sm" className="border-0 bg-gradient-to-r from-blue-500 to-blue-600 px-5 font-bold shadow-lg shadow-blue-500/20 hover:opacity-95" style={{ color: "#fff", fontWeight: 800 }}>
                登录 / 注册
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1500px] px-5 pb-12 pt-14 md:px-10 md:pb-16 md:pt-20">
        <div className="grid min-h-[560px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
          <div className="relative z-10 flex h-full flex-col justify-center">
              <p className="mb-6 text-sm font-black tracking-[0.28em] text-blue-600">INTERNAL AI WORKSPACE</p>
            <h1 className="max-w-none text-5xl font-black leading-[1.08] tracking-[-0.06em] text-slate-950 md:text-7xl">
              一个入口
              <br />
              <span className="whitespace-nowrap">生成所有<span className="text-blue-600">创意资产</span></span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-600">
              NexusAI 将智能对话、Nexus Image2、视频生成与 Nexus 3D 聚合到同一个工作台，让灵感、素材和资产管理保持在一条清晰链路里。
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="h-12 border border-white/70 bg-white/55 px-6 font-extrabold text-blue-700 backdrop-blur-xl shadow-[0_10px_30px_rgba(37,99,235,0.10)] hover:bg-white/70 hover:border-white/80"
                  style={{ fontSize: "1.03rem", fontWeight: 800, letterSpacing: "-0.01em" }}
                >
                  进入工作台
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/image">
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-12 border border-white/70 bg-white/55 px-6 font-extrabold text-slate-600 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.06)] hover:bg-white/70 hover:border-white/80"
                  style={{ fontSize: "1.03rem", fontWeight: 800, letterSpacing: "-0.01em" }}
                >
                  体验 Nexus Image2
                  <WandSparkles className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative min-h-[420px] lg:-mr-28 lg:min-h-[560px] xl:-mr-44">
            <div className="pointer-events-none absolute -inset-x-16 top-8 h-[420px] rounded-full bg-blue-300/18 blur-3xl" />
            <div className="relative h-full">
              <HomeCarousel showControls={false} variant="hero" />
            </div>
            <div className="pointer-events-none absolute -bottom-3 left-12 right-2 h-16 rounded-full bg-blue-500/10 blur-2xl" />
          </div>
        </div>

        <section className="relative z-10 mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="group relative overflow-hidden rounded-[1.5rem] border border-blue-100 bg-white/86 p-7 shadow-[0_18px_54px_rgba(15,23,42,0.06)] backdrop-blur transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_70px_rgba(37,99,235,0.14)]">
                <div className={cn("absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition group-hover:opacity-25", item.tone)} />
                <div className="relative z-10">
                  <span className={cn("grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br shadow-lg shadow-blue-500/20", item.tone)} style={{ color: "#fff" }}>
                    <Icon className="h-5 w-5" style={{ color: "#fff", stroke: "#fff" }} />
                  </span>
                  <h2 className="mt-6 text-xl font-black tracking-[-0.03em] text-slate-950">{item.title}</h2>
                  <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-500">{item.desc}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600">
                    立即体验
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      </section>
    </main>
  );
}
