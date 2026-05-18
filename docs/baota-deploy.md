# NexusAI 宝塔服务器部署指南（反向代理模式）

本文档按“本地上传代码 -> 宝塔安装依赖 -> 构建启动 -> Nginx 反代”的方式部署 NexusAI。

## 1. 服务器准备

建议环境：

- Linux 服务器，已安装宝塔面板
- Node.js 20 LTS 或 22 LTS
- pnpm
- PM2 或宝塔 Node 项目管理器
- 已备案并解析到服务器的域名
- 已配置阿里云 OSS，用于生产环境保存图片、视频、文档文件

生产环境不建议依赖 `public/mock-storage`，因为本地文件会随服务器目录迁移、重新部署或清理而丢失。

当前代码在 `NODE_ENV=production` 下默认要求配置 OSS。若未配置完整 `ALI_OSS_*`，文件上传类能力会失败，而不会静默降级到本地 `mock-storage`。这样可以避免上线后生成文件落在服务器临时目录，导致刷新、重启或迁移后资源丢失。

## 2. 上传项目

在本地项目目录排除这些目录后压缩上传：

```bash
node_modules
.next
.git
prisma/dev.db-journal
```

上传到服务器目录，例如：

```bash
/www/wwwroot/nexusai
```

也可以使用 Git 拉取代码：

```bash
cd /www/wwwroot
git clone <你的仓库地址> nexusai
cd nexusai
```

## 3. 安装 Node 和 pnpm

在宝塔软件商店安装 Node.js 20/22，或在 SSH 中确认：

```bash
node -v
npm -v
```

安装 pnpm：

```bash
npm i -g pnpm
pnpm -v
```

## 4. 配置环境变量

在项目根目录创建 `.env`：

```bash
cd /www/wwwroot/nexusai
cp .env.example .env
```

至少需要填写：

```env
DATABASE_URL="file:./prod.db"
SESSION_SECRET="请替换为足够长的随机字符串"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="请设置强密码"
DEFAULT_USER_PASSWORD="请设置默认用户强密码"

XHEAI_API_KEY=
XHEAI_BASE_URL=https://api.xheai.cc
XHEAI_BALANCE_TOKEN=
MOONSHOT_API_KEY=
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
AGENT_VISION_API_KEY=
AGENT_VISION_BASE_URL=
AGENT_VISION_MODEL=gpt-5.4

ALI_OSS_REGION=
ALI_OSS_BUCKET=
ALI_OSS_ACCESS_KEY_ID=
ALI_OSS_ACCESS_KEY_SECRET=
ALI_OSS_ENDPOINT=

# 自建联网搜索为主，百度千帆为兜底
AGENT_WEB_PRIMARY=self_hosted
AGENT_WEB_SELF_HOSTED_ENABLED=true
AGENT_SEARXNG_ENDPOINT=http://127.0.0.1:8080/search
AGENT_WEB_FETCH_MAX_RESULTS=12
AGENT_WEB_FETCH_MAX_PAGES=5
AGENT_WEB_FETCH_TIMEOUT_MS=8000
AGENT_WEB_PAGE_MAX_BYTES=2000000
AGENT_WEB_PAGE_SNIPPET_CHARS=1800
AGENT_WEB_RESPECT_ROBOTS=true
AGENT_WEB_USER_AGENT=NexusAI-WebContext/1.0

AGENT_WEB_SEARCH_API_KEY=
AGENT_WEB_SEARCH_MODE=web_search
AGENT_WEB_SEARCH_ENDPOINT=https://qianfan.baidubce.com/v2/ai_search/web_search
AGENT_WEB_SEARCH_SOURCE=baidu_search_v2
AGENT_WEB_SEARCH_TOP_K=5

VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_REGION=cn-north-1
VOLCENGINE_VISUAL_ENDPOINT=https://visual.volcengineapi.com
```

注意：

- `SESSION_SECRET` 生产环境必须配置，建议 32 位以上随机字符串。
- `ADMIN_PASSWORD` 生产环境必须配置，不能使用默认密码。
- 如需图片、视频、文档长期可下载，务必配置阿里云 OSS。
- 私有 OSS Bucket 保持私有即可，系统会使用签名 URL 或服务端代理链路。
- 不建议在生产环境设置 `ALLOW_LOCAL_STORAGE_FALLBACK=true`。该开关只适合临时排障。

OSS 相关变量必须完整：

```env
ALI_OSS_REGION=
ALI_OSS_BUCKET=
ALI_OSS_ACCESS_KEY_ID=
ALI_OSS_ACCESS_KEY_SECRET=
ALI_OSS_ENDPOINT=
```

联网搜索建议先在服务器上部署 SearXNG，并只监听本机地址，不要直接暴露到公网：

```bash
docker run -d --name nexusai-searxng \
  -p 127.0.0.1:8080:8080 \
  searxng/searxng:latest
```

如果服务器暂时不能运行 SearXNG，可以把 `AGENT_WEB_PRIMARY=baidu_qianfan`，先走百度千帆兜底。推荐最终仍使用自建搜索作为主链路，百度只作为备用。

自建搜索的合规边界：

- 只读取公开网页，不登录、不携带 Cookie、不绕过付费墙或验证码。
- 默认遵守 `robots.txt`，可通过 `AGENT_WEB_RESPECT_ROBOTS=true` 保持开启。
- 默认限制搜索结果数、抓取页面数、单页大小和超时时间，避免对外部网站造成过高压力。
- 服务端会拦截 localhost、内网 IP、私有 DNS 解析结果，降低 SSRF 风险。

## 5. 安装依赖

```bash
cd /www/wwwroot/nexusai
pnpm install
```

## 6. 初始化数据库

本项目当前使用 Prisma。若生产继续使用 SQLite：

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec tsx prisma/seed.ts
```

如果你的迁移目录不完整，第一次上线可先在测试环境确认后执行：

```bash
pnpm exec prisma db push
pnpm exec tsx prisma/seed.ts
```

上线前建议备份数据库文件：

```bash
cp prisma/prod.db prisma/prod.db.bak.$(date +%Y%m%d%H%M%S)
```

## 7. 构建项目

```bash
pnpm build
```

构建成功后会生成 `.next` 目录。

## 8. 启动服务

建议监听本机端口，例如 `3000`：

```bash
PORT=3000 pnpm start
```

使用 PM2：

```bash
pm2 start "pnpm start" --name nexusai --time
pm2 save
pm2 startup
```

如果宝塔 Node 项目管理器支持自定义命令：

- 项目目录：`/www/wwwroot/nexusai`
- 启动命令：`pnpm start`
- 端口：`3000`
- 运行环境：`production`

## 9. 宝塔 Nginx 反向代理

在宝塔创建站点，例如：

```text
域名：你的域名
根目录：/www/wwwroot/nexusai
```

然后在站点配置中增加反向代理到：

```text
http://127.0.0.1:3000
```

推荐 Nginx 配置片段：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

图片和视频生成可能耗时较长，`proxy_read_timeout` 建议设置为 `300s`。

## 10. 配置 HTTPS

在宝塔站点 SSL 面板申请 Let’s Encrypt 证书并开启强制 HTTPS。

启用 HTTPS 后，生产环境 Cookie 会使用 `secure=true`，所以请尽量通过 HTTPS 访问后台。

## 11. 上线后验证

按顺序验证：

1. 访问 `https://你的域名/login`
2. 使用 `.env` 中的管理员账号登录
3. 打开“用户”页面，确认管理员权限正常
4. 打开“对话”，确认默认 Agent 模式可用
5. 在服务器命令行验证自建联网搜索：
   `pnpm exec tsx scripts/test-self-hosted-web-search.ts "重庆今天温度"`
6. 在对话页开启“联网搜索”，测试“重庆今天温度”
7. 打开“图片”，测试 `Nexus Image2` 或 `Nexus Image mini2`
8. 打开“视频生成”，提交一个 720P 视频任务
9. 打开“历史记录”，确认图片、视频、对话历史都能显示
10. 点击历史中的图片/视频，确认预览和下载可用
11. 测试角色配额，确认 teacher/student 超额会被后端拦截

## 12. 常见问题

### 登录后又跳回登录页

检查：

- `SESSION_SECRET` 是否配置
- 是否通过 HTTPS 访问生产站点
- 服务器时间是否正确
- Nginx 是否正确传递 `Host` 和 `X-Forwarded-Proto`

### 图片或视频历史裂图

检查：

- OSS 环境变量是否完整
- Bucket 是否存在
- AccessKey 是否有写入和读取签名权限
- 服务器能否访问 OSS endpoint

### 生成任务卡在失败

检查服务端日志中的 provider 状态：

- xheai：检查 `XHEAI_API_KEY`、余额、模型通道
- 自建联网搜索：检查 `AGENT_SEARXNG_ENDPOINT` 是否能从 Node 服务访问
- 百度千帆兜底：检查 `AGENT_WEB_SEARCH_API_KEY` 和账号计费状态
- 火山引擎：检查 `VOLCENGINE_ACCESS_KEY_ID` / `VOLCENGINE_SECRET_ACCESS_KEY`

### 对话页联网搜索没有结果

先运行：

```bash
pnpm exec tsx scripts/test-self-hosted-web-search.ts "重庆今天温度"
```

如果脚本能返回结果但页面没有联网，检查对话框是否开启了“联网搜索”，或输入内容是否包含“今天、最新、新闻、天气、政策、课程标准”等需要实时资料的词。服务端日志会打印 `needWebSearch`、`endpoint`、`webContextCalled` 等字段。

如果脚本也没有结果，检查：

- SearXNG 容器是否运行
- `AGENT_SEARXNG_ENDPOINT` 是否配置为 `http://127.0.0.1:8080/search`
- 服务器能否访问外部搜索引擎和目标网页
- 是否被目标站点 `robots.txt` 限制抓取正文

### Nexus nano PRO 暂不可用

当前第三方返回模型通道不可用，前端已置灰。后续第三方恢复模型通道后，可在 `lib/image/config.ts` 将该模型 `enabled` 改回 `true`。

## 13. 更新部署

每次上传新代码后执行：

```bash
cd /www/wwwroot/nexusai
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm build
pm2 restart nexusai
```

如果使用宝塔 Node 项目管理器，则在构建完成后重启对应 Node 项目。
