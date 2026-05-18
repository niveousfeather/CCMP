# NexusAI 创作平台

NexusAI 是一个 Next.js + React + Tailwind CSS 的 AI 聚合平台原型，当前包含登录鉴权、用户管理、主题切换、工作台、对话、图片生成、视频生成和历史记录页面。

## 本地运行

```bash
cp .env.example .env
pnpm install
pnpm prisma:migrate -- --name init
pnpm prisma:seed
pnpm dev
```

默认地址：

```txt
http://localhost:3000
```

## 初始管理员

在 `.env` 中配置：

```txt
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="Admin123456"
SESSION_SECRET="replace-with-a-long-random-secret"
DEFAULT_USER_PASSWORD="ChangeMe123!"
```

执行 `pnpm prisma:seed` 后会创建初始管理员。若账号已存在，seed 会跳过。

## 批量导入用户

管理页支持上传 `.xlsx` 或 `.csv` 文件导入，Excel 模板位于：

```txt
public/templates/user-import-template.xlsx
```

字段规则：

- `username` 必填且唯一。
- `role` 可选，默认 `USER`，只支持 `ADMIN` 或 `USER`。
- `password` 可选，留空使用 `DEFAULT_USER_PASSWORD`。
- 文件大小不超过 5MB。
- 单次最多导入 500 条。
- `.xlsx` 只读取第一个 sheet。
