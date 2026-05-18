# NexusAI 服务器上传前检查与更新指引（2026-05-06）

本文档用于这次准备上传服务器前的版本检查和操作指引。目标是：替换新代码，保留服务器已有 `.env`、数据库和持久化数据，避免 3D 长任务、OSS 资产、数据分析页在生产环境出问题。

## 1. 本次检查结论

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| 新功能 OSS 存储 | 已接入 | 图片、视频、Agent 附件、3D 生成结果都走 `lib/storage/*`；3D 上传输入文件也已先写入 OSS。 |
| 3D 长任务超时 | 已加长 | `TRIPO_TIMEOUT_MS` 默认从 `120000` 调整为 `300000`，适配 2-5 分钟生成。 |
| 并发与排队 | 已接入 | 图片、视频、3D 提交后进入服务端队列；遇到并发、429、502/503/504、超时等可重试错误会自动排队重试。 |
| 数据分析前后端 | 已连接 | 管理员 `/analytics` 通过 `/api/admin/analytics` 读取真实历史、配额、`ErrorLog` 数据。 |
| 错误日志 | 已覆盖关键链路 | 图片、视频、3D 创建、3D 上传、3D 状态查询会写入 `ErrorLog`。 |
| 乱码 | 已扫描 | `app/`、`components/`、`lib/`、`prisma/`、`.env.example` 未发现常见中文乱码字符。 |
| TypeScript | 已通过 | 本地执行 `cmd /c npx tsc --noEmit --pretty false`，退出码 `0`。 |
| Next 生产构建 | 本地受限 | 当前 Codex 沙箱执行 `npm run build` 被 Windows `spawn EPERM` 拦截；服务器上传后必须执行一次。 |

## 2. 本次需要替换的代码

上传新版本时可以覆盖这些源码和配置文件：

```text
app/
components/
lib/
public/
scripts/
docs/
prisma/schema.prisma
prisma/migrations/
package.json
pnpm-lock.yaml
next.config.ts
middleware.ts
tailwind.config.ts
tsconfig.json
postcss.config.js
README.md
.env.example
```

不要上传或覆盖这些运行产物：

```text
node_modules/
.next/
tsconfig.tsbuildinfo
.env
prisma/*.db
prisma/*.db-journal
public/mock-storage/
```

## 3. 服务器必须保留的内容

| 路径或配置 | 操作 | 原因 |
| --- | --- | --- |
| `/www/wwwroot/nexusai/.env` | 必须保留 | 真实密钥、数据库地址、OSS、Tripo、搜索配置都在这里。 |
| SQLite 数据库文件 | 必须保留 | 用户、历史记录、资产、配额、数据分析源数据都在数据库内。 |
| `/www/wwwroot/nexusai/public/mock-storage` | 建议保留 | 如果历史版本曾经本地兜底存过文件，删除会导致旧链接失效。 |
| 宝塔 Node 项目配置 | 必须保留 | 端口、运行目录、启动命令。 |
| Nginx / SSL / 反向代理配置 | 必须保留 | 域名、HTTPS、代理超时。 |
| SearXNG / 自建搜索目录和容器 | 必须保留 | Agent 联网搜索依赖，不属于网站代码更新范围。 |

如果数据库现在还放在项目目录内，建议后续迁移到项目目录外，例如：

```env
DATABASE_URL="file:/www/data/nexusai/prod.db"
```

这次如果不迁移数据库，只要确保上传代码时不要覆盖或删除当前 `.db` 文件。

## 4. `.env` 需要核对的新增/关键变量

不要用 `.env.example` 覆盖服务器 `.env`。只手动核对和补充缺失项：

```env
TRIPO_API_KEY=你的 Tripo Platform API Key
TRIPO_BASE_URL=https://api.tripo3d.com/v2/openapi
TRIPO_MODEL_VERSION=v2.5-20250123
TRIPO_TIMEOUT_MS=300000

GENERATION_QUEUE_CONCURRENCY=1
GENERATION_IMAGE_CONCURRENCY=2
GENERATION_VIDEO_CONCURRENCY=1
GENERATION_MODEL3D_CONCURRENCY=1
GENERATION_QUEUE_MAX_RETRIES=3
GENERATION_QUEUE_RETRY_BASE_MS=12000
GENERATION_MODEL3D_RETRY_BASE_MS=20000

ALI_OSS_REGION=你的 OSS region
ALI_OSS_BUCKET=你的 bucket
ALI_OSS_ACCESS_KEY_ID=你的 access key id
ALI_OSS_ACCESS_KEY_SECRET=你的 access key secret
ALI_OSS_ENDPOINT=你的 OSS endpoint
```

生产环境注意：

- 不建议设置 `ALLOW_LOCAL_STORAGE_FALLBACK=true`。
- 当前代码在 `NODE_ENV=production` 且 OSS 未配置完整时，会直接报错，避免资产悄悄落到本地导致刷新后丢失。
- `TRIPO_TIMEOUT_MS=300000` 是 5 分钟，适合 3D 生成和 Tripo 上传/查询请求。
- `GENERATION_*_CONCURRENCY` 建议先保持保守值：图片 `2`、视频 `1`、3D `1`，避免第三方并发限制导致额外扣费或失败。
- 当前队列为 Node 进程内队列；视频和 3D 的“未提交到第三方”的排队任务可在前端轮询时恢复，已提交到第三方的任务继续按 provider task id 查询。图片任务若进程重启，已发出第三方请求但未保存结果的状态需要查看日志人工确认，避免自动重复提交造成重复扣费。

## 5. 数据库迁移指引

本次版本包含这些重要迁移：

```text
20260505170000_model3d_generation_history
20260506103000_model3d_role_daily_quota
20260506113000_error_log
```

服务器更新时只执行：

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

不要执行：

```bash
pnpm exec prisma migrate reset
pnpm exec prisma db push --force-reset
```

执行迁移前建议备份：

```bash
cp .env .env.bak.$(date +%Y%m%d%H%M%S)
cp prisma/prod.db prisma/prod.db.bak.$(date +%Y%m%d%H%M%S)
```

如果数据库文件名是 `dev.db`，把第二条改为：

```bash
cp prisma/dev.db prisma/dev.db.bak.$(date +%Y%m%d%H%M%S)
```

## 6. 宝塔 / Nginx 超时配置

3D 生成一般通过“提交任务 + 前端轮询”完成，服务器仍需要给 Tripo 上传、任务创建、任务查询、OSS 转存留足时间。

建议 Nginx 反向代理保留或调整为：

```nginx
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
send_timeout 300s;
client_max_body_size 100m;
```

说明：

- `client_max_body_size 100m` 对应 3D 上传接口当前最大 `80MB`。
- 如果宝塔 Node 项目管理里有请求超时设置，也建议设置为 `300s` 或更高。
- 3D 任务状态由前端每 5 秒轮询 `/api/model3d/tasks/[id]`，不会依赖单个 HTTP 请求一直挂 5 分钟。
- 图片、视频、3D 都是“提交后返回生成中 + 后台队列执行”；用户页面会保持生成中，直到轮询得到成功或失败。

## 7. 推荐上传流程

进入服务器项目目录：

```bash
cd /www/wwwroot/nexusai
```

先备份：

```bash
cp .env .env.bak.$(date +%Y%m%d%H%M%S)
```

如果 SQLite 数据库在项目目录内，也备份数据库：

```bash
cp prisma/prod.db prisma/prod.db.bak.$(date +%Y%m%d%H%M%S)
```

上传并覆盖新代码后执行：

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm build
```

构建成功后，在宝塔 Node 项目里重启 NexusAI。

## 8. 上线后验证清单

按顺序检查：

1. 打开 `/login`，管理员登录成功。
2. 打开 `/workspace`，账户余额和每日配额显示正常。
3. 打开用户管理页，确认 Tripo 钱包余额可正常显示。
4. 打开 `/model3d`，历史资产能加载。
5. 上传 PNG/JPG/WEBP 参考图，确认不会撑坏界面。
6. 上传 GLB/FBX/OBJ 模型文件，确认画布可接收；注意 FBX/OBJ 预览能力取决于前端 loader 支持。
7. 发起一次低参数 3D 生成，确认任务进入资产列表并轮询。
8. 任务成功后刷新网页，确认 3D 资产仍在，模型可从 `/api/model3d/preview/[id]` 加载。
9. 打开总历史记录，切换 `3D`，确认 3D 历史存在。
10. 打开 `/analytics`，确认只有管理员可访问，并能看到真实统计和错误日志。
11. 查看宝塔 Node 日志，确认没有连续 `500 / 502 / 504`。

## 9. 如果出现问题先看哪里

| 现象 | 优先检查 |
| --- | --- |
| 3D 点击生成后很快失败 | `.env` 的 `TRIPO_API_KEY`、Tripo 返回错误、`ErrorLog`。 |
| 3D 生成成功但刷新后没资产 | `Model3DGeneration` 表是否写入，OSS 是否配置完整。 |
| 模型无法预览 | `/api/model3d/preview/[id]`、OSS 签名 URL、模型格式是否为浏览器 loader 支持格式。 |
| 服务器 504 | Nginx `proxy_read_timeout`、Node 项目超时、`TRIPO_TIMEOUT_MS`。 |
| 任务一直生成中 | Node 进程是否重启、第三方 task id 是否已写入数据库、`GENERATION_*` 并发配置、`ErrorLog`。 |
| 数据分析空白 | 管理员权限、`prisma migrate deploy` 是否执行、`ErrorLog` 表是否存在。 |
| OSS 报错 | `ALI_OSS_*` 变量、bucket 权限、endpoint 是否包含 bucket 域名。 |

## 10. 本地验证记录

本次本地验证已执行：

```bash
cmd /c npx prisma generate
cmd /c npx tsc --noEmit --pretty false
```

结果：

- Prisma Client 生成成功。
- TypeScript 检查通过，退出码 `0`。
- 乱码扫描未发现常见坏字符。

本地 `npm run build` 在当前 Codex 沙箱中被系统权限拦截：

```text
Build error occurred
[Error: spawn EPERM]
```

这类错误发生在沙箱启动 Next 构建子进程阶段，不是 TypeScript 编译错误。服务器上传后仍必须执行 `pnpm build`，以服务器构建结果为准。
