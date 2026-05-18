# Word 批注驱动正文修订系统功能报告

## 1. 目标

搭建一个 AI 功能，输入一个带批注的 `.docx` Word 文档，输出一个：

- 已根据批注修改正文
- 尽量保持原有版式、样式、页眉页脚、图片、目录结构不变
- 可选择保留或清除批注
- 可追踪修改过程

的修订版 `.docx`。

这类能力的核心不是“生成一篇新 Word”，而是“**在原 Word 结构上做最小必要编辑**”。

---

## 2. 这次我是怎么做到的

这次处理不是把 Word 另存为纯文本再重建，而是直接操作 `.docx` 的内部 XML。

### 2.1 基本原理

`.docx` 本质上是一个 ZIP 包，内部主要包括：

- `word/document.xml`：正文
- `word/comments.xml`：批注内容
- `word/_rels/document.xml.rels`：正文关联关系
- `[Content_Types].xml`：包内资源类型声明
- 其他样式、页眉页脚、图片、脚注等文件

这次的流程是：

1. 打开原始 `.docx`
2. 读取 `comments.xml`，拿到每条批注内容
3. 读取 `document.xml`，找到批注锚点与对应正文段落
4. 根据批注判断哪些地方要：
   - 删词
   - 改标题
   - 改大小写
   - 改斜体
   - 重写某段
   - 调整参考文献
5. 在 **不重建整份文档** 的前提下，只替换相关段落内容
6. 保留原段落属性 `w:pPr`，尽量沿用原字符样式 `w:rPr`
7. 删除批注引用和批注文件
8. 重新打包为新的 `.docx`

### 2.2 这次实际采用的编辑策略

这次为了高效完成任务，采用的是：

- **段落级替换**
- **保留段落属性**
- **部分保留字符样式**
- **书名等局部设置斜体**
- **清理批注锚点和 comments 相关文件**

也就是说，系统并没有对每一个 run 做极细粒度编辑，而是：

- 先识别“哪一段受哪条批注影响”
- 再对该段做重写或替换
- 但保留该段原本的 Word 结构属性

这是一种很适合 MVP 的做法。

### 2.3 这次生成修订版的关键脚本逻辑

本次工作区中的实现原型在：

- [revise_docx.py](</E:/AI project/codex/WEByunming/docx_work/revise_docx.py>)

它做了这些关键动作：

- 用 `zipfile` 直接打开 `.docx`
- 用 `xml.etree.ElementTree` 解析 Word XML
- 读取批注与段落对应关系
- 对指定段落进行替换
- 尽量继承 `w:pPr` 和部分 `w:rPr`
- 移除：
  - `commentRangeStart`
  - `commentRangeEnd`
  - `commentReference`
  - `word/comments.xml`
  - `word/commentsExtended.xml`
  - `word/people.xml`
- 修正 `document.xml.rels`
- 修正 `[Content_Types].xml`
- 再打包输出新文档

---

## 3. 系统能力定义

建议把这个能力定义成一个独立服务：

### 3.1 输入

- 一个 `.docx` 文件
- 可选参数：
  - `mode=apply_comments`
  - `keep_comments=true|false`
  - `change_tracking=true|false`
  - `strict_format_preservation=true|false`
  - `language=zh|en|auto`

### 3.2 输出

- 修订后的 `.docx`
- 机器可读的修改报告 JSON
- 人类可读的修订报告 Markdown / HTML

### 3.3 典型用户场景

- 学生论文批注修订
- 编辑按审稿意见修改稿件
- 合同根据法务批注修正
- 教师批阅作文后自动生成修订版
- 企业内部文档根据 review comments 自动修稿

---

## 4. 推荐产品架构

建议拆成 5 层。

### 4.1 文件解析层

职责：

- 解包 `.docx`
- 建立 XML 资源索引
- 读取正文、批注、样式、目录、脚注、图片关系

建议技术：

- Python
- `zipfile`
- `lxml` 优先，`xml.etree.ElementTree` 可做 MVP

### 4.2 语义定位层

职责：

- 找到每条批注对应的文本范围
- 建立“批注 -> 正文片段 -> 所在段落/章节”的映射

这是最关键的一层。

### 4.3 AI 决策层

职责：

- 理解批注意图
- 判断是：
  - 删除
  - 局部替换
  - 格式修正
  - 段落重写
  - 结构调整
- 生成修改方案

### 4.4 文档编辑层

职责：

- 将 AI 输出变成真正的 Word XML 修改
- 尽量保留原格式
- 支持 tracked changes 或 clean rewrite

### 4.5 验证与回归层

职责：

- XML 结构校验
- comments 关系一致性校验
- 文本抽样核验
- 可选 PDF 渲染比对

---

## 5. `.docx` 核心数据结构

### 5.1 Word 正文

正文主要由段落 `w:p` 和 run `w:r` 组成：

- `w:p`：段落
- `w:pPr`：段落样式属性
- `w:r`：字符片段
- `w:rPr`：字符样式属性
- `w:t`：文本

### 5.2 批注锚点

批注通常由这些元素关联：

- `w:commentRangeStart`
- `w:commentRangeEnd`
- `w:commentReference`

批注内容本体在：

- `word/comments.xml`

### 5.3 为什么“格式不变”难

因为 Word 的格式并不是挂在整段纯文本上的，而是散落在：

- 段落属性
- run 属性
- 编号系统
- 表格结构
- 域代码
- 目录域
- 页眉页脚
- 图片关系

所以不能简单做：

1. 提取全文文本
2. 改成新文本
3. 再写回

这样几乎一定会破坏格式。

---

## 6. 建议的处理流水线

## 6.1 Step 1: 解包与索引

处理时先读取：

- `word/document.xml`
- `word/comments.xml`
- `word/styles.xml`
- `word/numbering.xml`
- `word/_rels/document.xml.rels`
- `[Content_Types].xml`

输出一个中间索引：

```json
{
  "paragraphs": [],
  "runs": [],
  "comments": [],
  "commentAnchors": [],
  "relationships": []
}
```

## 6.2 Step 2: 建立批注映射

你需要把每条批注变成：

```json
{
  "comment_id": "42",
  "comment_text": "Logical problem.",
  "paragraph_index": 127,
  "selected_text": "Days Without End, which focuses on such issues...",
  "section_heading": "1.2.2. Studies at Home"
}
```

这一步建议做两层实现：

### MVP 方案

- 以段落为中心
- 只要某段出现 comment range，就把该段视作受影响段
- 记录被选中文本

### 完整方案

- 精确到 run 范围
- 支持跨 run、跨超链接、跨脚注、跨域代码的批注范围恢复

## 6.3 Step 3: 批注意图分类

把批注先分类，再决定编辑方式。

推荐分类：

- `delete`
- `replace_text`
- `fix_capitalization`
- `fix_spelling`
- `apply_italics`
- `move_phrase`
- `rewrite_sentence`
- `rewrite_paragraph`
- `rewrite_section`
- `bibliography_normalization`
- `format_adjustment`
- `needs_human_review`

例如：

- `delete`
- `capitalize`
- `italics`
- `Full name?`
- `Write one paragraph only.`
- `Repetitive. Rewrite.`
- `Give a chapter-by-chapter synopsis.`

这些其实对应的是不同级别的编辑。

## 6.4 Step 4: 选择编辑策略

### 策略 A：run 级微创编辑

适合：

- 改一个词
- 改标点
- 改大小写
- 加斜体

优点：

- 格式保留最好

缺点：

- 实现复杂

### 策略 B：段落级替换

适合：

- 批注要求整句重写
- 整段逻辑不通
- 段落内容需要扩写/压缩

优点：

- 实现快
- 对 AI 最友好

缺点：

- 需要处理好局部格式继承

### 策略 C：结构级编辑

适合：

- 目录
- 参考文献
- 章节标题
- 多段摘要合并

## 6.5 Step 5: 执行 XML 修改

编辑时尽量遵守：

1. 保留 `w:pPr`
2. 保留原有编号属性
3. 优先复用已有 `w:rPr`
4. 只在必要时新增 `w:i`、`w:b` 等字符属性
5. 不碰无关 XML

## 6.6 Step 6: 处理批注状态

你需要支持两种输出模式：

### 模式 1：清洁版

- 正文已改
- 批注全部移除

### 模式 2：审阅版

- 正文已改
- 保留批注
- 或把修改写成 tracked changes

这次我是做的 **清洁版**。

---

## 7. AI 提示词与决策设计

不要让模型直接输出整份新文档，应该让它输出“结构化编辑计划”。

推荐输出格式：

```json
{
  "comment_id": "24",
  "action": "rewrite_paragraph",
  "scope": {
    "paragraph_index": 117
  },
  "instructions": {
    "goal": "remove repetition and make the introduction more concise",
    "preserve": ["academic tone", "topic focus", "novel title"],
    "avoid": ["changing thesis direction"]
  },
  "result_text": "..."
}
```

更稳的做法是两阶段：

### 阶段 1：批注理解

输入：

- 批注文本
- 被批注的原文
- 上下文段落
- 标题层级

输出：

- 意图类别
- 修改建议
- 是否可自动执行

### 阶段 2：文本生成

只有在明确可自动执行时才生成替换文本。

---

## 8. 保持格式不变的关键策略

这是系统成败的核心。

### 8.1 不要“全文重写后另存”

必须做原位编辑。

### 8.2 段落级编辑时保留 `w:pPr`

段落的：

- 对齐
- 缩进
- 行距
- 编号
- outline level

都通常在 `w:pPr` 里。

### 8.3 字符样式尽量继承首个 run 的 `w:rPr`

这样能保住：

- 字号
- 字体
- 颜色
- 加粗
- 下划线

### 8.4 局部格式单独打补丁

例如书名斜体：

- 先生成分段文本
- 再只对命中的那一段 run 添加 `w:i`

### 8.5 目录不要手工“重排版”

如果目录是静态文本，可以像普通段落处理。

如果目录是 Word 域生成的：

- 最好保留结构
- 只改对应标题
- 打开 Word 后让目录自动刷新

---

## 9. 推荐的数据模型

```ts
type CommentAnchor = {
  commentId: string;
  paragraphIndex: number;
  selectedText: string;
  startPath?: string;
  endPath?: string;
};

type CommentItem = {
  id: string;
  author: string;
  date?: string;
  text: string;
};

type EditPlan = {
  commentId: string;
  action:
    | "delete"
    | "replace_text"
    | "apply_italics"
    | "fix_capitalization"
    | "rewrite_paragraph"
    | "rewrite_section"
    | "needs_human_review";
  paragraphIndex: number;
  targetText?: string;
  replacementText?: string;
  richSegments?: Array<{ text: string; italic?: boolean; bold?: boolean }>;
  confidence: number;
  reason: string;
};
```

---

## 10. 系统模块拆分建议

## 10.1 `docx_reader`

职责：

- 解包
- 读 XML
- 建索引

## 10.2 `comment_mapper`

职责：

- 识别 comment range
- 还原批注命中的文本

## 10.3 `revision_planner`

职责：

- 批注分类
- 生成结构化编辑计划

## 10.4 `docx_editor`

职责：

- 按 edit plan 修改 XML
- 支持段落级和 run 级编辑

## 10.5 `docx_cleaner`

职责：

- 删除批注文件
- 删除批注锚点
- 修正 relationships
- 修正 content types

## 10.6 `validator`

职责：

- XML 可解析性检查
- 关系文件一致性检查
- 文本抽样检查

---

## 11. 验证机制

至少做 4 层验证。

### 11.1 XML 解析验证

确保：

- 所有 `.xml` / `.rels` 可正常解析

### 11.2 关系完整性验证

确保：

- 删除了 comments 文件后，`document.xml.rels` 不再引用它们
- `[Content_Types].xml` 不再声明 comments 相关 part

### 11.3 语义回归验证

检查：

- 目标批注是否已落实
- 旧错误文本是否还残留
- 是否误删正文

### 11.4 渲染验证

理想做法：

- 用本地 Word / LibreOffice / Aspose 渲染成 PDF
- 抽样比对页面结构

---

## 12. 推荐技术栈

## 12.1 MVP

- Python
- `zipfile`
- `lxml`
- OpenAI / 其他大模型 API

### 原因

- Python 处理 XML 和文件很快
- 适合先把链路跑通

## 12.2 生产版

后端可选：

- Python FastAPI
- Node.js + TypeScript

文档处理建议：

- 解析层：Python 更顺手
- 编排层：Node 或 Python 都可以

如果你要高稳定商业化，建议评估：

- Aspose.Words
- LibreOffice headless
- Microsoft Graph / Office Online 能力

---

## 13. MVP 实施方案

建议分 3 个阶段。

### Phase 1：可用原型

能力：

- 读取 `.docx`
- 解析批注
- 定位到段落
- 由 AI 生成段落替换方案
- 输出清洁版 `.docx`

限制：

- 主要支持段落级修改
- 局部富文本仅支持斜体/粗体
- 不做 tracked changes

### Phase 2：增强格式保真

能力：

- run 级编辑
- 更好的局部格式继承
- 表格内批注支持
- 脚注/尾注支持
- 更好的目录处理

### Phase 3：专业文档审阅版

能力：

- tracked changes
- 保留批注并写入回复
- 批量处理
- 审核工作流
- 人工确认节点

---

## 14. 难点与风险

## 14.1 批注范围不总是干净

有些 Word 批注：

- 只标中一个字符
- 横跨多个 run
- 混有域代码、脚注、超链接

所以你不能假设“被批注文本 == 一个完整字符串”。

## 14.2 AI 可能误改

比如批注写：

- `?`
- `Full name?`
- `See above.`

这些依赖上下文，自动化风险很高。

解决办法：

- 输出 `confidence`
- 低置信度进入人工确认

## 14.3 段落重写会丢局部格式

如果原段里有：

- 斜体
- 上标
- 特殊引用格式

段落级整体替换可能丢失这些细节。

解决办法：

- 先识别局部格式热点
- 或只允许某些段落做整体替换

## 14.4 参考文献修订很容易“看似对，实则错”

AI 会把格式改漂亮，但未必符合真实来源。

建议：

- 参考文献单独做规则化模块
- 并允许接入联网校验

---

## 15. 人机协同建议

不要把它做成“完全黑箱自动改稿”，更好的产品形态是：

### 模式 A：自动修订

适合简单批注：

- delete
- italics
- capitalization
- spelling

### 模式 B：建议修订

适合复杂批注：

- rewrite
- logical problem
- unclear reference
- reorganize

系统先给：

- 原文
- 批注
- 建议改法
- AI 草案

再由用户确认。

---

## 16. 一个推荐的 API 设计

### 16.1 上传并分析

`POST /api/docx/analyze-comments`

返回：

```json
{
  "documentId": "doc_123",
  "comments": [
    {
      "commentId": "24",
      "commentText": "Repetitive. Rewrite.",
      "paragraphIndex": 117,
      "selectedText": "On Canaan's Side belongs to..."
    }
  ]
}
```

### 16.2 生成编辑计划

`POST /api/docx/generate-revision-plan`

返回：

```json
{
  "plan": [
    {
      "commentId": "24",
      "action": "rewrite_paragraph",
      "paragraphIndex": 117,
      "replacementText": "..."
    }
  ]
}
```

### 16.3 应用编辑

`POST /api/docx/apply-revision-plan`

返回：

```json
{
  "outputFileUrl": "/files/doc_123_revised.docx",
  "reportUrl": "/files/doc_123_report.json"
}
```

---

## 17. 提示词设计建议

推荐系统提示词约束模型：

1. 不要改未被批注影响的内容
2. 优先最小改动
3. 保持原语言、原学术风格、原论证方向
4. 如果批注含义不明确，返回 `needs_human_review`
5. 输出必须是结构化编辑计划，不是整篇文章

对于复杂文档，最好使用：

- `comment understanding prompt`
- `rewrite prompt`
- `format decision prompt`

三套提示词，而不是一个大杂烩 prompt。

---

## 18. 推荐的落地路线

如果你现在就要开工，我建议这个顺序：

1. 先做 **只支持 `.docx` + 只支持清洁版输出** 的 MVP
2. 先把“批注映射 + 段落替换 + 格式尽量保持”跑通
3. 再增加：
   - 局部斜体
   - 删除批注
   - 参考文献规则化
4. 再做人工确认 UI
5. 最后再考虑 tracked changes

因为真正难的不是“AI 会不会写”，而是：

- 是否准确打到原文位置
- 是否不破坏 Word
- 是否让用户信任结果

---

## 19. 对这次方案的客观评价

这次实现能解决一个真实任务，但它仍然是：

- **任务导向的原型**
- **不是通用生产级引擎**

它的优点：

- 快
- 可控
- 对原文档破坏小
- 很适合论文批注修订场景

它的不足：

- 批注意图识别仍有较多人工判断成分
- 主要是段落级编辑，不是完整 run 级精修
- 没有 tracked changes
- 对复杂表格、脚注、域代码场景支持有限

所以你要做产品的话，建议把这次方案视为：

- **MVP 参考实现**
- 不是最终架构终点

---

## 20. 结论

要实现“根据 Word 批注改正文且格式不变”，正确路线不是重新生成 Word，而是：

1. 解析 `.docx` 内部 XML
2. 建立批注与正文映射
3. 让 AI 输出结构化编辑计划
4. 在原文档结构上做最小修改
5. 进行 XML、关系、语义、渲染多层验证

一句话总结：

**这是一个“文档结构编辑系统”，不是一个“文本生成系统”。**

如果你要继续往下搭，下一步最值得先做的是：

- `comment_mapper` 设计稿
- `revision_plan` JSON schema
- Python MVP 服务骨架

我也可以继续直接给你补三份文件：

- 系统架构图版设计文档
- API 详细定义文档
- Python MVP 项目脚手架说明
