# 本版本服务器覆盖上传清单

更新时间：2026-05-12

你这次准备直接覆盖服务器项目文件夹。请按本文档打包和上传，目标是：

```text
更新当前版本代码
保留服务器原来的数据库、用户、历史任务、生成记录、上传文件和 .env
```

## 1. 最简单安全做法

不要整包上传整个项目目录。

请只上传下面列出的文件和文件夹，覆盖服务器同名文件即可。

## 2. 必须上传的文件和文件夹

### 2.1 图片生成链路

上传：

```text
lib/image/config.ts
lib/image/subrouter.ts
app/api/ai/image/route.ts
```

### 2.2 3D 工作区前端

上传：

```text
components/model3d/model3d-page.tsx
components/model3d/model3d-parameter-panel.tsx
components/model3d/model3d-history-panel.tsx
components/model3d/model3d-viewer.tsx
app/globals.css
```

### 2.3 测试 / 检查脚本

建议一起上传，方便服务器验证：

```text
scripts/test-image2-subrouter-key-pool.ts
scripts/check-image2-subrouter-live.ts
scripts/test-model3d-responsive-layout.ts
```

### 2.4 环境变量示例

可以上传：

```text
.env.example
```

注意：`.env.example` 只是示例文件，可以覆盖。

## 3. 不要上传 / 不要覆盖的文件

这些文件和目录不要上传，不要覆盖服务器上的原文件。

```text
.env
.env.local
prisma/dev.db
*.db
*.sqlite
*.sqlite3
node_modules/
.next/
uploads/
public/mock-storage/
storage/
```

尤其不要覆盖：

```text
.env
prisma/dev.db
```

否则可能导致：

```text
API Key 丢失
用户账号丢失
历史任务记录丢失
图片 / Word / PPT / Excel / 3D / 视频生成记录丢失
```

## 4. 如果你想按文件夹上传

可以上传这些文件夹，但必须排除里面的敏感/运行时文件。

### 4.1 可以上传的文件夹

```text
app/
components/
lib/
scripts/
docs/
```

### 4.2 上传 app/ 时注意

可以覆盖：

```text
app/api/ai/image/route.ts
app/globals.css
```

不要因为上传 `app/` 影响 `.env` 或数据库；正常情况下它们不在 `app/` 里。

### 4.3 上传 lib/ 时注意

可以覆盖：

```text
lib/image/config.ts
lib/image/subrouter.ts
```

本次没有要求改 Word / PPT / Excel / 普通聊天，因此不建议额外覆盖无关文件。

### 4.4 上传 components/ 时注意

可以覆盖：

```text
components/model3d/
```

本次主要是 3D 工作区布局更新。

## 5. 推荐打包方式

新建一个临时目录，例如：

```text
deploy-update/
```

把这些文件按原目录结构复制进去：

```text
deploy-update/
  app/
    globals.css
    api/
      ai/
        image/
          route.ts
  components/
    model3d/
      model3d-page.tsx
      model3d-parameter-panel.tsx
      model3d-history-panel.tsx
      model3d-viewer.tsx
  lib/
    image/
      config.ts
      subrouter.ts
  scripts/
    test-image2-subrouter-key-pool.ts
    check-image2-subrouter-live.ts
    test-model3d-responsive-layout.ts
  docs/
    SERVER_UPDATE_DEPLOYMENT_NOTES.md
  .env.example
```

然后只压缩 `deploy-update/` 里的内容上传服务器。

## 6. 服务器 .env 需要手动确认

不要覆盖服务器 `.env`。

只在服务器原 `.env` 里补充这些图片专用变量：

```env
IMAGE2_PROVIDER=subrouter
IMAGE2_BASE_URL=https://subrouter.ai/v1
IMAGE2_MODEL=gpt-image-2
IMAGE2_API_KEY_1=你的图片 key 1
IMAGE2_API_KEY_2=你的图片 key 2
IMAGE2_API_KEY_3=你的图片 key 3
IMAGE2_MAX_CONCURRENT_PER_KEY=2
IMAGE2_REQUEST_TIMEOUT_MS=300000
IMAGE2_RETRY_ENABLED=true
```

不要改：

```env
AGENT_TASK_API_KEY
DATABASE_URL
SESSION_SECRET
```

## 7. 覆盖上传后执行

进入服务器项目目录：

```bash
pnpm install
pnpm prisma generate
pnpm next build
```

如果服务器用 npm：

```bash
npm install
npx prisma generate
npx next build
```

不要执行：

```bash
prisma migrate reset
prisma db push --force-reset
prisma migrate dev
prisma db seed
```

## 8. 重启服务

按服务器实际方式重启。

PM2 示例：

```bash
pm2 restart all
```

或：

```bash
pm2 restart nexus-ai
```

## 9. 上传后验证

### 9.1 图片链路

运行：

```bash
npx tsx scripts/test-image2-subrouter-key-pool.ts
```

真实调用测试：

```bash
npx tsx scripts/check-image2-subrouter-live.ts
```

期望：

```text
provider=subrouter
model=gpt-image-2
keyIndex=1/2/3
不打印真实 API Key
不使用 AGENT_TASK_API_KEY
```

### 9.2 3D 响应式布局

运行：

```bash
npx tsx scripts/test-model3d-responsive-layout.ts
```

网页检查：

```text
/model3d
```

确认：

```text
左侧工作区可以手动折叠 / 展开
小屏下左侧自动折叠
折叠后中央 3D 画布向左延伸
右侧资产栏小屏下自动折叠
页面没有横向滚动
```

## 10. 最终上传清单

如果你只想看最短清单，就是这些：

```text
app/globals.css
app/api/ai/image/route.ts
components/model3d/model3d-page.tsx
components/model3d/model3d-parameter-panel.tsx
components/model3d/model3d-history-panel.tsx
components/model3d/model3d-viewer.tsx
lib/image/config.ts
lib/image/subrouter.ts
scripts/test-image2-subrouter-key-pool.ts
scripts/check-image2-subrouter-live.ts
scripts/test-model3d-responsive-layout.ts
.env.example
docs/SERVER_UPDATE_DEPLOYMENT_NOTES.md
```

## 11. 最重要提醒

直接覆盖服务器文件夹时，千万不要覆盖：

```text
.env
prisma/dev.db
uploads/
public/mock-storage/
```

本次更新不需要改数据库，之前的用户、任务、历史记录和生成资产都应该保留。
