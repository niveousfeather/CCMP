# Word Generation Acceptance

Generated at: 2026-05-12T06:27:33.181Z
Frontend base URL: http://localhost:3000

## Summary

- Cases: 5
- Remote primary success: 4/5
- Any fallback used: 1/5
- Directly deliverable: 5/5

## Results

### 1. 教案

- Test prompt: 给我一份三维动画教学课程，第一章节动画规律的教案，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、运动规律、缓入缓出、挤压拉伸
- File name: 三维动画教学课程-第一章节-动画规律教案.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:lesson_plan
- Elapsed: 90844 ms
- Tables: 5
- Heading1 count: 9
- Numbered paragraphs: 3
- Advantages: 核心主题和用户约束均已覆盖; 包含 5 个表格或结构化表; 一级标题层级清楚; 未出现平台署名
- Problems: none
- Directly deliverable: yes
- Next module to fix: Continue upload-docx modification acceptance and visual polish checks.

### 2. 报告

- Test prompt: 生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议
- File name: 社区养老服务满意度报告.docx
- Actual model: xheai:local-document-fallback
- Fallback triggered: yes
- Route reason: create_document:output:docx,operation:create,documentType:report:local_document_fallback
- Elapsed: 243603 ms
- Tables: 2
- Heading1 count: 8
- Numbered paragraphs: 0
- Advantages: 核心主题和用户约束均已覆盖; 包含 2 个表格或结构化表; 一级标题层级清楚; 未出现平台署名
- Problems: none
- Directly deliverable: yes
- Next module to fix: Continue upload-docx modification acceptance and visual polish checks.

### 3. 方案

- Test prompt: 写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标
- File name: 校园低碳行动方案.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:proposal
- Elapsed: 318614 ms
- Tables: 8
- Heading1 count: 9
- Numbered paragraphs: 0
- Advantages: 核心主题和用户约束均已覆盖; 包含 8 个表格或结构化表; 一级标题层级清楚; 未出现平台署名
- Problems: none
- Directly deliverable: yes
- Next module to fix: Continue upload-docx modification acceptance and visual polish checks.

### 4. 工作总结

- Test prompt: 写一份《2026年第一季度客户成功团队工作总结》，面向管理层，范围包括续费跟进、客户培训、工单响应，要求包含成果数据、问题不足、改进措施和下季度计划
- File name: 2026年第一季度客户成功团队工作总结.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:summary
- Elapsed: 132404 ms
- Tables: 7
- Heading1 count: 7
- Numbered paragraphs: 6
- Advantages: 核心主题和用户约束均已覆盖; 包含 7 个表格或结构化表; 一级标题层级清楚; 未出现平台署名
- Problems: none
- Directly deliverable: yes
- Next module to fix: Continue upload-docx modification acceptance and visual polish checks.

### 5. 会议纪要

- Test prompt: 整理一份《产品例会》会议纪要，会议时间2026年5月10日，参会对象为产品部、研发部和运营部，议题包括新版首页上线、数据看板权限、用户反馈闭环，要求列出决议事项、待办任务、责任人与截止时间
- File name: 产品例会会议纪要.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:meeting_minutes
- Elapsed: 41616 ms
- Tables: 4
- Heading1 count: 6
- Numbered paragraphs: 3
- Advantages: 核心主题和用户约束均已覆盖; 包含 4 个表格或结构化表; 一级标题层级清楚; 未出现平台署名
- Problems: none
- Directly deliverable: yes
- Next module to fix: Continue upload-docx modification acceptance and visual polish checks.

## Upload DOCX Modification Acceptance

Generated at: 2026-05-12T06:29:20.386Z

### Summary

- Cases: 4
- Deliverable now: 4/4
- Original-format route exercised: 3/4
- Comment-revision route exercised: 1/4

### Results

#### 1. title_edit_preserve_format

- Test prompt: 请在原文档基础上修改并保留原格式：把标题改为“社区志愿服务活动实施方案”。
- Source file: community-plan-source.docx
- Output file: 在原文档基础上修改并保留原格式-把标题改为-社区志愿服务活动实施方案-修.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:proposal,requiresFile,hasFiles:revise_original
- Elapsed: 5652 ms
- Expected terms missing: none
- Table present: no
- Comments cleared: yes
- Directly deliverable: yes
- Current finding: Route behaved as expected for this fixture.

#### 2. section_expansion_preserve_format

- Test prompt: 请在原文档基础上修改并保留原格式：扩写“执行安排”这一节，补充报名分组、物资准备、宣传节奏和现场协调。
- Source file: community-plan-source.docx
- Output file: 在原文档基础上修改并保留原格式-扩写-执行安排-这一节-补充报名分组-物.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:document,requiresFile,hasFiles:revise_original
- Elapsed: 70492 ms
- Expected terms missing: none
- Table present: no
- Comments cleared: yes
- Directly deliverable: yes
- Current finding: Route behaved as expected for this fixture.

#### 3. paragraph_to_table_preserve_format

- Test prompt: 请在原文档基础上修改并保留原格式：把“执行安排”段落改成表格形式，包含事项、负责人、时间节点。
- Source file: community-plan-source.docx
- Output file: 在原文档基础上修改并保留原格式-把-执行安排-段落改成表格形式-包含事项.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,documentType:document,requiresFile,hasFiles:revise_original
- Elapsed: 5438 ms
- Expected terms missing: none
- Table present: yes
- Comments cleared: yes
- Directly deliverable: yes
- Current finding: Route behaved as expected for this fixture.

#### 4. comment_revision

- Test prompt: 请根据 Word 批注修改正文。
- Source file: commented-weekly-report.docx
- Output file: 根据-批注修改正文-修改版.docx
- Actual model: claudecoder:gpt-5.4
- Fallback triggered: no
- Route reason: create_document:output:docx,operation:create,style:comment_revision,requiresFile,hasFiles:revise_comments
- Elapsed: 5503 ms
- Expected terms missing: none
- Table present: no
- Comments cleared: yes
- Directly deliverable: yes
- Current finding: Route behaved as expected for this fixture.

### Known Gaps

- This suite uses compact DOCX fixtures; it does not yet cover images, headers/footers, complex tables, tracked changes, or long source documents.
- Original-format revision now covers paragraph replacement and paragraph-to-table conversion for safe body paragraphs; broader rich structural edits still need separate coverage.
