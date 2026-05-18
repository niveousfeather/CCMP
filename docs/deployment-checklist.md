# NexusAI 服务器部署准备清单

适用场景：内部 AI 聚合平台，10 人以内使用，Next.js + Prisma + SQLite，宝塔环境，Node.js / pnpm 已安装，不使用 Docker、Redis、MySQL。

## 1. 本地需要准备

- 确认代码已提交或完整备份。
- 确认 `.env.example` 已包含生产环境需要的变量。
- 本地执行：
  - `pnpm install`
  - `pnpm prisma:generate`
  - `pnpm prisma:migrate`
  - `pnpm build`
- 准备管理员初始账号：
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
- 准备第三方模型 Key：
  - `XHEAI_API_KEY`
  - `MOONSHOT_API_KEY`
- 准备阿里云 OSS Bucket 和 AccessKey。

## 2. 服务器需要准备

- Node.js 版本建议使用 20 LTS 或 22 LTS。
- pnpm 已安装。
- 宝塔 Node 项目管理器可用。
- 域名已解析到服务器。
- 服务器安全组放行：
  - `80`
  - `443`
  - 内部 Node 端口，例如 `3000`
- 服务器目录建议：
  - `/www/wwwroot/nexusai`
  - SQLite 数据库可放在项目内 `prisma/prod.db`，或放在单独持久化目录。

## 3. `.env` 变量

```env
DATABASE_URL="file:./prod.db"
SESSION_SECRET="replace-with-a-long-random-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="Admin123456"
DEFAULT_USER_PASSWORD="ChangeMe123!"
DEFAULT_USER_QUOTA=100

XHEAI_API_KEY=
XHEAI_BALANCE_TOKEN=
XHEAI_BASE_URL=https://api.xheai.cc

MOONSHOT_API_KEY=
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1

ALI_OSS_REGION=
ALI_OSS_BUCKET=
ALI_OSS_ACCESS_KEY_ID=
ALI_OSS_ACCESS_KEY_SECRET=
ALI_OSS_ENDPOINT=
```

注意：
- `.env` 不要提交到 Git。
- `SESSION_SECRET` 必须是足够长的随机字符串。
- `DEFAULT_USER_QUOTA` 是 NexusAI 内部用户额度，不是 XHEAI 平台余额。

## 4. OSS Bucket 配置

- 创建阿里云 OSS Bucket。
- 建议同地域部署，减少延迟。
- 权限建议：
  - Bucket 私有。
  - 服务端使用 AccessKey 上传。
  - 前端只拿服务端返回的签名 URL 或公开 URL。
- CORS 如后续需要浏览器直传，再开放；当前阶段由服务端上传，通常不需要开放直传 CORS。
- 对象路径按用户隔离：
  - `users/{userId}/images/{date}/{uuid}.png`
  - `users/{userId}/uploads/{date}/{uuid}.{ext}`

## 5. SQLite 数据库处理

- 首次部署：
  - 上传代码后执行 `pnpm prisma migrate deploy`
  - 执行 `pnpm prisma:seed`
- 已有本地数据要迁移：
  - 停止本地服务。
  - 复制 `prisma/dev.db` 到服务器目标路径，例如 `prisma/prod.db`。
  - 确保 `DATABASE_URL="file:./prod.db"` 指向正确文件。
- 备份建议：
  - 每天备份 SQLite 文件。
  - 每次部署前备份一次。

## 6. Prisma 命令

生产服务器推荐：

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma:seed
```

开发环境可用：

```bash
pnpm prisma migrate dev
```

## 7. Next.js 构建和启动

```bash
pnpm build
pnpm start
```

默认启动端口是 `3000`。如需指定端口：

```bash
pnpm start -- -p 3000
```

## 8. 宝塔 Node 项目配置

- 项目目录：`/www/wwwroot/nexusai`
- 启动命令：`pnpm start -- -p 3000`
- 构建命令：`pnpm install --frozen-lockfile && pnpm prisma generate && pnpm prisma migrate deploy && pnpm build`
- 运行用户需要对以下文件有读写权限：
  - `.env`
  - SQLite 数据库文件
  - Prisma 目录

## 9. Nginx / 域名 / SSL

Nginx 反向代理到 Node 服务：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

- 在宝塔里为域名申请 SSL。
- 强制 HTTPS。
- 确认 `SESSION_SECRET` 已配置，生产 cookie 会启用 secure。

## 10. 数据备份建议

必须备份：
- `.env`
- SQLite 数据库文件
- OSS Bucket 文件
- 如后续有本地上传目录，也要一起备份

建议频率：
- SQLite：每日自动备份。
- OSS：开启版本控制或生命周期备份策略。
- `.env`：每次变更后离线备份。

## 11. 最简单上线步骤

1. 上传代码到服务器 `/www/wwwroot/nexusai`。
2. 创建生产 `.env`。
3. 配置 OSS Bucket 和环境变量。
4. 执行：
   ```bash
   pnpm install --frozen-lockfile
   pnpm prisma generate
   pnpm prisma migrate deploy
   pnpm prisma:seed
   pnpm build
   ```
5. 宝塔 Node 项目启动：`pnpm start -- -p 3000`。
6. 配置 Nginx 反向代理到 `127.0.0.1:3000`。
7. 开启 SSL。
8. 用管理员账号登录，测试：
   - 登录 / 退出
   - 用户管理
   - Chat
   - 图片生成
   - 图片历史刷新后保留
   - 用户额度不足拦截
   - OSS 是否生成对象
