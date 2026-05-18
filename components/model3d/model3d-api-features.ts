export type Model3DApiFeature =
  | "animation-apply"
  | "animation-rig"
  | "export-model"
  | "generate-model"
  | "import-model"
  | "part-complete"
  | "part-split"
  | "pbr-material"
  | "retopo"
  | "texture-edit"
  | "texture-generate"
  | "texture-upscale";

export type Model3DApiFeatureMeta = {
  docs: string;
  feature: Model3DApiFeature;
  label: string;
  note: string;
};

export type Model3DExportFormat = "FBX" | "OBJ" | "STL" | "GLB";
export type Model3DExportResolution = "512" | "1k" | "2k" | "4k";

export type Model3DExportRequest = {
  bottomCenterPivot: boolean;
  fileName: string;
  format: Model3DExportFormat;
  resolution: Model3DExportResolution;
};

export const model3DApiFeatures: Record<Model3DApiFeature, Model3DApiFeatureMeta> = {
  "animation-apply": {
    docs: "https://platform.tripo3d.com/docs/animation",
    feature: "animation-apply",
    label: "动画应用",
    note: "后续接入动画动作应用、重定向与运动生成任务接口。"
  },
  "animation-rig": {
    docs: "https://platform.tripo3d.com/docs/animation",
    feature: "animation-rig",
    label: "自动绑定",
    note: "后续接入动画/自动绑定任务接口。"
  },
  "export-model": {
    docs: "https://platform.tripo3d.com/docs/post-process",
    feature: "export-model",
    label: "模型导出",
    note: "后续接入模型导出、格式转换和轴点处理接口。"
  },
  "generate-model": {
    docs: "https://platform.tripo3d.com/docs/generation",
    feature: "generate-model",
    label: "模型生成",
    note: "后续接入文本、图片、多视图生成 3D 任务接口。"
  },
  "import-model": {
    docs: "https://platform.tripo3d.com/docs/import-model",
    feature: "import-model",
    label: "导入模型",
    note: "后续接入本地 3D 模型上传、导入和 Tripo 资源注册接口。"
  },
  "part-complete": {
    docs: "https://platform.tripo3d.com/docs/editing",
    feature: "part-complete",
    label: "部件补全",
    note: "后续接入模型部件补全、网格修复和闭合补面任务接口。"
  },
  "part-split": {
    docs: "https://platform.tripo3d.com/docs/editing",
    feature: "part-split",
    label: "部件拆分",
    note: "后续接入模型部件拆分，并映射为右侧父子层级。"
  },
  "pbr-material": {
    docs: "https://platform.tripo3d.com/docs/post-process",
    feature: "pbr-material",
    label: "PBR 材质",
    note: "后续接入为已有贴图模型生成 PBR 材质通道。"
  },
  retopo: {
    docs: "https://platform.tripo3d.com/docs/post-process",
    feature: "retopo",
    label: "重拓扑",
    note: "后续接入重拓扑、智能低模和目标面数控制任务接口。"
  },
  "texture-edit": {
    docs: "https://platform.tripo3d.com/docs/editing",
    feature: "texture-edit",
    label: "纹理编辑",
    note: "后续接入文本编辑和绘制编辑任务接口。"
  },
  "texture-generate": {
    docs: "https://platform.tripo3d.com/docs/generation",
    feature: "texture-generate",
    label: "纹理生成",
    note: "后续接入图片、多视图和文本纹理生成接口。"
  },
  "texture-upscale": {
    docs: "https://platform.tripo3d.com/docs/post-process",
    feature: "texture-upscale",
    label: "纹理放大",
    note: "后续接入已有贴图模型的纹理分辨率提升接口。"
  }
};

export function getModel3DApiFeatureMeta(feature: Model3DApiFeature) {
  return model3DApiFeatures[feature];
}
