# WordBook — 科学背单词 (Cloudflare Workers)

一个基于 Cloudflare Workers 的全栈背单词应用，内置**艾宾浩斯记忆曲线**自动安排复习：新词 → 第2天 → 第7天 → 第15天 → 第30天 → 第60天，答对晋级、答错重置。支持用户系统、会员订阅（易支付）、邮箱找回密码、后台管理。单仓库、零服务器、按量付费。

> 本仓库为开源模板。仓库内的数据库 ID、域名等均为占位符，首次部署请运行 `npm run setup` 自动创建并回填，详见 [AGENTS.md](./AGENTS.md) 的 AI 部署指南。

## ✨ 功能特性

- **科学复习**：艾宾浩斯记忆曲线，每个单词独立进度（stage 0→5），答对进入下一周期、答错回到初始周期
- **每日任务**：`/api/today` 拉取今天到期单词，批量默写、分组完成
- **账号体系**：注册/登录/登出、PBKDF2(SHA-256, 100k) 密码哈希、数据库 Session
- **会员订阅**：后台配置套餐（周期/价格），易支付网关收款（USDT/微信/支付宝/Stripe），支付回调自动续期
- **找回密码**：SMTP 发送验证码邮件（QQ/163/Gmail 等，SMTP AUTH LOGIN + STARTTLS/SSL）
- **运营后台**：词库（编辑/删除用户单词）、用户管理（延长会员/删除）、套餐管理、订单查询、SMTP/易支付系统设置、修改后台密码

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Cloudflare Workers (Hono + TypeScript) |
| 数据库 | D1 (SQLite) |
| 会话 | 数据库 Session（随机 token，HttpOnly Cookie） |
| 密码 | PBKDF2 (SHA-256, 100000 次) |
| 支付 | 易支付 (MD5 签名，可选) |
| 邮件 | SMTP over Workers TCP sockets (可选) |

## 📁 目录结构

```
src/
  index.ts  主路由（页面 + API + 后台，单文件）
  mail.ts   SMTP 发送器（Workers sockets + STARTTLS/SSL）
  md5.ts    纯 JS MD5（易支付签名用）
  pay.ts    易支付签名 / 下单 / 回调验签
  util.ts   密码哈希、Cookie/Session、settings 读写
migrations/ D1 schema（0001 单词表 → 0002 用户/会话/套餐/订单 → 0003 单词归属用户）
scripts/
  setup.mjs  一键初始化（建 D1、回填 ID、跑迁移、初始化后台密码）
  formal_secret_scan.mjs  开源前敏感信息扫描
  validate-jsonc.mjs      wrangler.jsonc 语法校验
test/
  smoke.mjs  冒烟测试（注册/加词/默写/会员，可传 BASE_URL）
```

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 一键初始化（自动创建 D1、回填 database_id、执行迁移、生成后台密码）
npm run setup

# 3. 本地开发
npm run dev

# 4. 部署到 workers.dev（默认开启，不占用自定义域名）
npm run deploy

# 5. 冒烟测试（ADMIN_PASSWORD 用于清理测试数据，可省略）
ADMIN_PASSWORD=<后台密码> npm test https://<your-worker>.workers.dev
```

详细步骤、所需 Token 权限、常见报错对照表见 **[AGENTS.md](./AGENTS.md)**（AI 可直接照单执行）。

## 🔑 环境变量与密钥

本项目**无必需环境变量**。所有密钥存在 **D1 `settings` 表**（后台 `/admin` → 系统设置 配置）：

| 设置 key | 用途 | 必填 | 不填会怎样 |
|---|---|---|---|
| `admin_password` | 后台登录密码 | ✅（`npm run setup` 自动生成） | 后台无法登录 |
| `smtp_host/port/user/pass/from` | 找回密码邮件 | 否 | 邮件功能降级 |
| `yipay_apiurl/pid/key` | 会员购买收款 | 否 | 支付功能降级 |
| `pay_channels` | 前端支付渠道 | 否 | 默认四渠道 |

> 除 `admin_password` 外，缺失均**功能降级而非崩溃**。完整清单见 [AGENTS.md](./AGENTS.md)「secrets 清单」。

## ⚙️ 部署后自定义

- **后台地址**：`https://<your-worker>.workers.dev/admin`，首次密码见 `npm run setup` 输出，登录后请立即修改
- **站点域名**：默认 `workers.dev` 可用；自定义域名在 Cloudflare 控制台绑定（wrangler.jsonc 未配置 routes，避免冲突）
- **图标**：`src/index.ts` 中 favicon 使用占位 CDN `https://your-cdn.example.com/wordbook-ico.png`，可替换

## 🧾 License

MIT
