# LangManager 自托管部署（Docker Compose）

把 Supabase 全套（Postgres + GoTrue + PostgREST + Kong）+ AI 翻译服务 + 前端 React 一次性拉起，**单条命令部署**。

---

## 架构

```
浏览器 ──> web 容器 (Nginx, 本机 127.0.0.1:8080)
              ├── 托管 React 静态文件 (SPA)
              └── 反代 /rest/、/auth/、/translate/ 到 kong (内部 :8000)
                        ├── kong ──> rest (PostgREST) ──> db (Postgres)
                        ├── kong ──> auth (GoTrue)    ──> db (Postgres)
                        └── kong ──> translate (Node 版腾讯云 TMT)
  db 初始化由 init-db 容器执行 01-init.sql 完成
  init-admin 容器（依赖 db/auth/kong 就绪后）通过 GoTrue Admin API 自动创建超级管理员
```

- **对外只暴露 web 容器**（本机 8080，再由你自己的反代/域名对外）。
- Kong 统一监听 `8000`，承载 `/rest/v1`、`/auth/v1`、`/translate/v1` 三类路由。
- 数据库、auth、kong、translate 都只在内部网络通信，不暴露公网。
- **AI 翻译未使用 Supabase Edge Function（Deno）**，而是用 `docker/translate` 容器等价替代，经 Kong 暴露为 `/translate/v1/translate`。

---

## 前置要求

- Docker + Docker Compose v2（`docker compose version` 验证）
- 一台 Linux 服务器（推荐 2C4G 以上）
- 域名（可选，但推荐；不配也能用 IP + 端口跑）
- Node.js 18+（用于本地生成密钥脚本）

---

## 从 0 部署步骤（完整顺序）

### 1. 准备环境变量

```bash
cd docker
cp .env.example .env
vim .env
```

**至少修改以下变量**（其余可先用默认值验证）：

| 变量 | 说明 | 是否必改 |
|------|------|----------|
| `PUBLIC_DOMAIN` | 浏览器访问的前端地址，如 `http://localhost:8000` 或 `https://your.domain` | 是 |
| `VITE_SUPABASE_URL` | 必须等于 `PUBLIC_DOMAIN`（前端与 API 同源） | 是 |
| `VITE_TRANSLATE_URL` | 翻译服务地址，默认 `http://localhost:8000/translate/v1/translate` | 一般不用改 |
| `POSTGRES_PASSWORD` | 数据库超级用户密码（>=16 位强随机） | 是 |
| `JWT_SECRET` | JWT 签名密钥（>=32 位强随机） | 是 |
| `ENCRYPTION_KEY` | 加密密钥（32 字节） | 是 |
| `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD` | 默认管理员账号（默认 `admin@example.com` / `admin123`） | 生产务必修改 |
| `SMTP_*` | 邮件功能；不配也可注册，只是收不到邮件 | 可选 |

> 生成强随机值：
> ```bash
> openssl rand -base64 32   # 用作 JWT_SECRET / ENCRYPTION_KEY / POSTGRES_PASSWORD
> ```

### 2. 生成 anon / service_role key

```bash
node init/generate-keys.mjs
```

脚本读取 `.env` 的 `JWT_SECRET`，把 `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_ANON_KEY` 写回 `.env`。
这两把 key 是前端和后端调用 Supabase 的凭据，**必须生成**。

### 3. 启动全套（务必带 `--build`）

```bash
docker compose -f docker-compose.yml up -d --build
```

> ⚠️ **必须加 `--build`**：`web` 和 `translate` 是本地 `build:` 镜像，`VITE_*` 等构建期变量只在构建时注入。若只 `up -d`，改了 `.env` 后前端不会生效（表现为翻译走错路径等灵异问题）。

首次启动会按顺序：
1. 拉起 `db` / `auth` / `rest` / `kong` / `translate`
2. `init-db`（一次性）执行 `init/01-init.sql`：建表 + 角色 + 触发器 + RLS 策略
3. `init-admin`（一次性，等 db/auth/kong 健康后）经 Kong Admin API 创建超级管理员，
   其 `on_auth_user_created` 触发器自动生成 profile 并分配 `super_admin` 角色

可用以下命令观察初始化进度：
```bash
docker compose -f docker-compose.yml logs -f init-db init-admin
```

### 4. 验证部署

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/            # 前端 HTML，应 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/auth/v1/health   # 应 200
```

登录前端：访问 `http://<你的服务器>:8080`，用 `admin@example.com / admin123` 登录，**立即修改密码**。

### 5. 配置翻译密钥（系统设置页面）

进入前端 **「系统设置 → 翻译配置」**，填入腾讯云机器翻译（TMT）的 `SecretId` / `SecretKey`
（在 https://console.cloud.tencent.com/cam/capi 获取）。保存后翻译服务即从数据库读取密钥，
无需重启、无需改 `.env`。

> 说明：翻译密钥**优先从数据库 `system_configs` 表读取**（前端页面配置），`.env` 里的
> `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 仅作为兜底，通常留空即可。

---

## 对外暴露（生产必做）

`web` 容器只绑定 `127.0.0.1:8080`（仅本机）。生产环境请在服务器上再放一层 Nginx/Caddy：

- 反向代理到 `127.0.0.1:8080`
- **HTTPS（Let's Encrypt 证书）**
- 可选：为 `/rest/v1/` 配置缓存（缓解 i18n 读流量）

示例 Caddy（服务器上，非容器内）：
```
your.domain {
    reverse_proxy 127.0.0.1:8080
}
```

---

## 数据备份

```bash
docker compose -f docker-compose.yml exec -T db \
  pg_dump -U postgres postgres > backup_$(date +%F).sql
```

---

## 重跑初始化（慎用，会清空数据）

```bash
# 重建数据库（清空所有数据后重新建表）
docker compose -f docker-compose.yml down -v
docker compose -f docker-compose.yml up -d --build

# 仅重新创建默认管理员账号（数据库已存在、仅管理员丢失时）
docker compose -f docker-compose.yml run --rm init-admin
```

> 管理员密码由 GoTrue 用 scrypt 哈希存储，**不能通过 init.sql 直接 `INSERT auth.users` 创建**
> （GoTrue v2.189 不兼容 crypt()/bf 哈希，会导致登录 `invalid_credentials`）。
> 因此统一由 `init-admin` 容器经 Kong 调用 Admin API 创建。

---

## 已知问题与排错

### Q1. 前端翻译报错 `Failed to send a request to the Edge Function ... /functions/v1/translate`
**原因**：前端走了 Supabase 标准 Edge Function 路径 `/functions/v1/translate`，
但自托管 Kong 路由是 `/translate/v1/translate`，路径不匹配。
**排查**：确认 `docker/web/Dockerfile` 已把 `VITE_TRANSLATE_URL` 作为 `ARG/ENV` 注入，
且 `web` 服务 `args` 中透传 `VITE_TRANSLATE_URL: ${VITE_TRANSLATE_URL}`。
**修复**：改完上述两点后必须 `docker compose up -d --build web` 重建前端镜像
（Vite 变量是构建时注入，仅重启不生效）。

### Q2. `init-db` 报错 `FATAL: database "supabase_admin" does not exist`
**原因**：`init-db` 的 psql 命令原先漏写 `-d postgres`，psql 默认用用户名 `supabase_admin`
作为库名，导致连不上库、业务表全部未创建（表现为 public 下 0 张表）。
**修复**：entrypoint 改为 `psql -h db -U supabase_admin -d postgres -f ...`。
若已因此导致表为空，执行 `down -v` 再 `up -d --build` 重来。

### Q3. Kong 启动失败 `Bind for 0.0.0.0:8000 failed: port is already allocated`
**原因**：8000 端口被占用（常见于本机已有另一套 Supabase/lang-manger 部署，
如旧 `langmgr-*` 容器未清理，或 kong 实例冲突）。
**排查**：`docker ps --format '{{.Names}}\t{{.Ports}}' | findstr 8000` 找出占用者。
**修复**：停止并删除冲突容器（如 `docker rm -f langmgr-kong-1 ...`），再 `up`。

### Q4. 启动后一切正常，但翻译返回 502 BadGateway（从浏览器/外部访问时）
**注意**：从容器内部访问 `kong:8000/translate/v1/translate` 若返回 400/401 说明链路通，
502 多为外部请求时上游解析问题。请确认 `kong.yml` 中 `translate` 服务的 `host: translate`
与 `docker-compose.yml` 中 `translate` 服务名一致，且 translate 容器 `healthcheck` 通过。
如仍异常，尝试 `docker compose restart kong translate`。

### Q5. 翻译返回 `TMT Error: InvalidParameterValue 不支持的语种：en_to_zh-CN`
**原因**：前端传 `zh-CN`（BCP-47），而腾讯云 TMT 只认 `zh`（简体）/ `zh-TW`（繁体）。
**修复**：`docker/translate/index.mjs` 的 `callTmt` 已加 `normalizeLang()` 归一化
（`zh-CN→zh`、`zh-TW→zh-TW`、`en-US→en` 等），重建 translate 镜像即可：
`docker compose up -d --build translate`。前端无需改动。

### Q6. 翻译返回 `未配置密钥`
**原因**：`system_configs` 表中还没有腾讯云密钥。
**修复**：在前端「系统设置 → 翻译配置」页面填入 SecretId/SecretKey 保存即可
（存库后 translate 服务 60s 内自动生效）。`.env` 的 `TENCENT_*` 仅为兜底，可留空。

---

## 注意事项

- `GOTRUE_MAILER_AUTOCONFIRM=true`：自托管无邮件验证，注册即激活。配置好 SMTP 后可改 `false`。
- 翻译密钥明文存于 `system_configs` 表（前端设计如此），请妥善保管数据库访问权限。
- `docker/.env` 已被根目录 `.gitignore` 忽略，密钥不会提交到 git。
- 升级镜像版本：修改 `docker-compose.yml` 中各镜像 tag 后 `docker compose up -d --build`。
- 默认管理员密码 `admin123` 为弱密码，生产环境请通过 `INIT_ADMIN_PASSWORD` 修改，
  或登录后在个人中心修改。
