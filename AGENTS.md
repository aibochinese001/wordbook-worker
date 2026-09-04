# AGENTS.md — AI / 开发者部署指南

本文件面向**任何 Agent（或人）**自动化部署本 Worker。请严格按下面步骤照单执行，不要自由发挥；遇到报错先查「常见报错对照表」。

---

## 1. 项目速览

- **形态**：Cloudflare Workers 全栈应用（Hono + TypeScript），单 Worker + D1 数据库（SQLite），无 R2/KV/Workers AI。
- **功能**：科学背单词（艾宾浩斯记忆曲线，按 2/7/15/30/60 天周期复习）、用户注册/登录、会员订阅（套餐 + 易支付）、邮箱找回密码（SMTP）、后台管理（词库/用户/套餐/订单/系统设置）。
- **配置**：`wrangler.jsonc`（JSONC，支持注释）
- **部署目标**：默认部署到 `https://<worker-name>.<account>.workers.dev`（`workers_dev: true`，未绑定任何自定义域名）。
- **入口脚本**：`npm run setup`（一键创建 D1、回填 database_id、执行迁移、初始化后台密码，见 `scripts/setup.mjs`）。
- **密钥存放**：本 Worker **不读取任何环境变量**（Bindings 仅 D1 `DB`）。SMTP 邮箱、易支付密钥、后台密码全部存在 D1 `settings` 表，由后台页面维护。

## 2. 前置条件

| 项目 | 要求 |
|---|---|
| Node.js | >= 20（本项目在 22 上验证） |
| npm | >= 9 |
| Cloudflare 账号 | 免费版即可 |
| API Token | 见下方「3. Token 权限清单」 |

## 3. Token 权限清单（CLOUDFLARE_API_TOKEN）

在 Cloudflare 控制台 → My Profile → API Tokens → Create Token，选 **Edit Cloudflare Workers** 模板，并按下表勾选（权限必须 ≥ 下表的粒度，否则 setup/deploy 会失败）：

| 权限 | 级别 | 资源范围 | 用于 |
|---|---|---|---|
| Workers Scripts | **Edit** | Account | `wrangler deploy` / `dev` |
| D1 | **Edit** | Account | `wrangler d1 create/execute` |
| Account Settings | **Read** | Account | 校验账号信息（部分 wrangler 命令需要） |

> 本项目不涉及 R2 / KV / Workers AI，无需这些权限（如你的 Token 模板自带也无妨）。Token 创建后：
> ```bash
> export CLOUDFLARE_API_TOKEN="cf_YOUR_TOKEN_HERE"
> ```

## 4. 一键部署（推荐路径）

```bash
# 1) 安装依赖
npm install

# 2) 一键初始化：创建 D1 wordbook-db、回填 database_id、依序执行
#    migrations/*.sql、初始化后台管理员密码（自动生成并打印）
#    （要求 CLOUDFLARE_API_TOKEN 已设置，或本机已 wrangler login）
npm run setup

# 3) 本地验证（可选）
npm run dev        # 打开 http://localhost:8787

# 4) 部署到 workers.dev
npm run deploy

# 5) 确认上线
curl -s https://<your-worker>.<your-account>.workers.dev/          # 首页
curl -s https://<your-worker>.<your-account>.workers.dev/api/plans  # 套餐列表 API

# 6) 冒烟测试（需要真实后台密码，用于清理测试数据）
ADMIN_PASSWORD=<后台密码> npm test https://<your-worker>.<your-account>.workers.dev
```

## 5. 手动步骤（等价于 npm run setup，排查时用）

```bash
# 创建 D1 并记录返回的 database_id
npx wrangler d1 create wordbook-db
# 把输出的 UUID 填进 wrangler.jsonc 的 database_id（替换 REPLACE_WITH_D1_DATABASE_ID）

# 依序执行所有迁移
for f in migrations/*.sql; do
  npx wrangler d1 execute wordbook-db --remote --file="$f"
done

# 初始化后台管理员密码（幂等；若 settings 表已存在则跳过）
npx wrangler d1 execute wordbook-db --remote --command \
  "INSERT OR IGNORE INTO settings (k, v) VALUES ('admin_password', '你的强密码')"

# 部署
npx wrangler deploy
```

## 6. secrets 清单表

### 6.1 环境变量 / Worker secrets

本项目**无任何必需环境变量**（代码不读 env）。`.dev.vars.example` 仅示例，可忽略。

### 6.2 后台系统设置（D1 `settings` 表，登录后台 → 系统设置 填写，非环境变量）

| 设置 key | 干什么用 | 哪里获取 | 必填 | 不填会怎样 |
|---|---|---|---|---|
| `admin_password` | 后台登录密码（`/admin`） | `npm run setup` 自动生成打印 | ✅ 必填 | 后台无法登录；可用手动步骤插入 |
| `smtp_host` / `smtp_port` / `smtp_user` / `smtp_pass` / `smtp_from` | SMTP 发信（找回密码验证码邮件） | 你的邮箱服务商（QQ/163/Gmail 等，端口 465 或 25/587） | 否 | 找回密码/验证码邮件不可用，注册登录不受影响（功能降级） |
| `yipay_apiurl` / `yipay_pid` / `yipay_key` | 易支付网关（USDT/微信/支付宝/Stripe 收款） | 易支付商户后台 | 否 | 会员购买支付不可用（功能降级） |
| `pay_channels` | 前端可展示的支付渠道（JSON 数组） | 自定 | 否 | 默认 `["usdt","wechat","alipay","stripe"]` |

### 6.3 会员套餐（后台「套餐管理」维护，存 `plans` 表）

| 字段 | 说明 |
|---|---|
| `name` / `period_days` / `price_usd` / `active` / `sort` | 套餐名、有效天数、美元价格、启用、排序 |

> 设计原则：除 `admin_password` 外，SMTP / 易支付等密钥缺失时**功能降级而非崩溃**——单词、复习、注册登录照常运行。

## 7. 部署后自定义

1. **站点域名**：默认 `workers.dev` 可用。若用自定义域名，在 Cloudflare 控制台 Worker → 设置 → 域名绑定（本仓库 wrangler.jsonc 未配置 routes，避免与你的真实域名冲突）。
2. **图标 CDN**：`src/index.ts` 中 favicon 使用占位 CDN `https://your-cdn.example.com/wordbook-ico.png`（两处），请替换为你的图床 URL 或删除该行。
3. **冒烟测试域名**：`test/smoke.mjs` 默认 `https://your-worker.workers.dev`，用 `npm test https://你的域名` 覆盖。

## 8. 常见报错对照表

| 报错信息 | 原因 | 解决办法 |
|---|---|---|
| `Missing credentials` / `Authentication error` / `Could not find account` | 未登录或 Token 无效 | `export CLOUDFLARE_API_TOKEN="cf_..."` 或 `npx wrangler login` |
| `You do not have permission to perform this action` | Token 权限不够 | 回看第 3 节，补 Workers Scripts / D1 的 Edit 权限 |
| `A database with the name ... already exists` | D1 已存在 | 复用现有 ID：`npx wrangler d1 list` 里找 ID 填进 wrangler.jsonc |
| `database_id` 未替换就 deploy | 忘跑 setup | `npm run setup` 或用 `npx wrangler d1 list` 回填 |
| `✘ [ERROR] Processing wrangler.jsonc: ... ` | wrangler.jsonc 语法错误 | 检查注释/引号是否合法 JSONC |
| 迁移执行报 `table X already exists` | 重复执行迁移 | migrations 均为幂等（IF NOT EXISTS / OR IGNORE），可安全重跑 |
| `wrangler d1 execute` 很慢或超时 | 首次冷启动 / 网络 | 重试一次，或分段执行 |
| 部署后 404 | 未设置 `workers_dev` 或路由冲突 | 确认 wrangler.jsonc 有 `"workers_dev": true` |
| 后台提示「后台未初始化」 | settings 表无 `admin_password` | 重跑 `npm run setup`，或按第 5 节手动插入 |
| 邮件发不出 | SMTP 未配置 / 端口 / 授权码错误 | 后台系统设置检查 smtp_*；QQ/163 需用「授权码」而非登录密码 |
| 支付失败「管理员未配置易支付网关」 | yipay_* 未配置 | 后台系统设置填写 yipay_apiurl/pid/key |

## 9. 对 Agent 的硬性提示

- **不要**向任何第三方暴露 `CLOUDFLARE_API_TOKEN`、后台 `admin_password`、SMTP/易支付密钥。
- **不要**提交 `.dev.vars`、`*.db`、`.wrangler/`、`*.bak*`（已在 `.gitignore` 覆盖）。
- 每次部署前，确认 `wrangler.jsonc` 中 `database_id` 不是 `REPLACE_WITH_D1_DATABASE_ID`。
- 本仓库是公开模板：不要把真实生产域名、真实数据库 ID、真实邮箱、真实后台密码写进代码或提交。
