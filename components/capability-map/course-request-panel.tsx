"use client";

import { AlertCircle, Bot, CheckCircle2, Database, FileWarning, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { CourseAbilityGraphInput } from "@/lib/capability-map/course-ability-graph";

export const DEFAULT_COURSE_REQUEST = "请生成重庆地区影视动画专业《AI动画全流程制作》课程能力图谱";

const COMMON_REGIONS = [
  "内蒙古",
  "黑龙江",
  "北京",
  "天津",
  "上海",
  "重庆",
  "河北",
  "山西",
  "辽宁",
  "吉林",
  "江苏",
  "浙江",
  "安徽",
  "福建",
  "江西",
  "山东",
  "河南",
  "湖北",
  "湖南",
  "广东",
  "广西",
  "海南",
  "四川",
  "贵州",
  "云南",
  "西藏",
  "陕西",
  "甘肃",
  "青海",
  "宁夏",
  "新疆",
  "香港",
  "澳门",
  "台湾"
];

function cleanSegment(value: string) {
  return value
    .replace(/^(请|帮我|为|面向|生成|设计|构建|输出|制作|一个|一份|当地|本地)+/g, "")
    .replace(/课程能力图谱/g, "")
    .replace(/课程/g, "")
    .replace(/[，。,；;：:\s]/g, "")
    .trim();
}

export function parseCourseRequestText(text: string, current: CourseAbilityGraphInput): CourseAbilityGraphInput {
  const compactText = text.replace(/\s+/g, "");
  const courseFromBrackets = text.match(/《([^》]+)》/)?.[1];
  const courseFromLabel = text.match(/(?:课程名称|课程)\s*[：:]\s*([^，。,；;\n]+)/)?.[1];
  const courseName = cleanSegment(courseFromBrackets || courseFromLabel || current.courseName);

  const explicitRegion = text.match(/(?:地区|区域|城市|面向)\s*[：:]?\s*([\u4e00-\u9fa5]{2,8})/)?.[1];
  const regionFromText = COMMON_REGIONS.find((region) => compactText.includes(region));
  const region = cleanSegment(regionFromText || explicitRegion || current.region);

  const labeledMajor = text.match(/(?:专业方向|专业)\s*[：:]\s*([^，。,；;\n]+)/)?.[1];
  const majorBeforeKeyword = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-]+?)专业/)?.[1];
  const majorDirection = cleanSegment((labeledMajor || majorBeforeKeyword || current.majorDirection).replace(region, ""));

  return {
    courseName: courseName || current.courseName,
    majorDirection: majorDirection || current.majorDirection,
    region: region || current.region
  };
}

export function CourseRequestPanel({
  error,
  form,
  onFormChange,
  onGenerate,
  onParse,
  onPromptChange,
  prompt
}: {
  error: string | null;
  form: CourseAbilityGraphInput;
  onFormChange: (form: CourseAbilityGraphInput) => void;
  onGenerate: () => void;
  onParse: () => void;
  onPromptChange: (value: string) => void;
  prompt: string;
}) {
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_20px_60px_rgba(37,99,235,0.08)]">
      <div className="flex items-start gap-3 border-b border-slate-200 pb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-700">AI 助手入口</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">课程能力图谱生成系统</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">输入课程建设需求，系统会基于本地示例数据生成课程能力结构与教学建议。</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-700">自然语言需求</span>
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-[138px] resize-none border-blue-100 bg-blue-50/70 text-slate-900 placeholder:text-slate-400 focus:border-blue-300"
            placeholder={DEFAULT_COURSE_REQUEST}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onParse}
            className="border-blue-100 bg-white text-blue-700 hover:border-blue-200 hover:bg-blue-50"
          >
            <Wand2 className="h-4 w-4" />
            解析需求
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onGenerate}
            className="border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            生成图谱
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            解析结果，可手动调整
          </div>
          <div className="grid gap-3">
            <RequestField
              label="课程名称"
              value={form.courseName}
              onChange={(value) => onFormChange({ ...form, courseName: value })}
              placeholder="AI动画全流程制作"
            />
            <RequestField
              label="专业方向"
              value={form.majorDirection}
              onChange={(value) => onFormChange({ ...form, majorDirection: value })}
              placeholder="影视动画"
            />
            <RequestField
              label="地区"
              value={form.region}
              onChange={(value) => onFormChange({ ...form, region: value })}
              placeholder="重庆"
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <StatusLine icon={Database} text="当前为本地示例数据，未接入真实资料库，不能作为正式引用。" />
          <StatusLine icon={Sparkles} text="智能生成能力暂未开启，本轮仅进行本地解析与示例展示。" />
          <StatusLine icon={FileWarning} text="证据来源为占位说明，不提供正式政策、报告或网页引用。" />
        </div>
      </div>
    </section>
  );
}

function RequestField({
  label,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300"
      />
    </label>
  );
}

function StatusLine({ icon: Icon, text }: { icon: typeof Database; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
      <span>{text}</span>
    </div>
  );
}
