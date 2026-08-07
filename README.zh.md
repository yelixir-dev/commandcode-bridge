<p align="center">
<img src="docs/assets/banner.svg" alt="CommandCode Bridge — 面向可信环境的 OpenAI-compatible CommandCode 网关" width="880">

</p>

<p align="center">
  <strong>在可信网络中通过 OpenAI-compatible API 使用 CommandCode 模型、凭据和路由。</strong>
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-1.14.0-b57920?style=flat-square" alt="Version 1.14.0"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/models-52-1f6f78?style=flat-square" alt="52 models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

[English](./README.md) | [한국어](./README.ko.md) | **中文**

<!-- README-I18N:END -->

CommandCode Bridge 是面向 CommandCode 账号的可信环境 HTTP 网关。它提供标准 OpenAI-compatible 模型与聊天端点，在符合条件的上游凭据之间路由请求，并发布与 CommandCode/bridge **1.14.0** 对齐的准确 **52-model** catalog。

[功能](#功能) · [安装](#安装) · [用法](#用法) · [工作原理](#工作原理) · [仓库布局](#仓库布局) · [当前限制](#当前限制) · [许可证](#许可证)

## 功能

- **OpenAI-compatible API。** 无需为每次请求启动 `cmd`，即可列出/查询模型并提供 streaming 或 non-streaming chat。

- **CommandCode stream 转换。** 把 visible text、usage、finish reason 和 emitted tool call 规范化为 OpenAI response shape。

- **Multi-key routing。** 支持 `daily_burn_priority`、`balance_priority`、`round_robin`、`drain_first`，以及每 key concurrency、cooldown、model scope 和 pre-output failover。

- **通用到期优先级。** 在所有 policy 下，已知 **1 天或更短**到期的 eligible credential 会先于长期凭据选择。

- **Context metadata。** catalog 有公开 context 时返回 `context_window`、`context_length`、`max_context_length`。

- **移动优先 dashboard。** 以韩文、英文、中文管理 bind、routing、credential、model toggle，并按 provider 折叠模型。

- **Secret 边界。** 不分发 key 或 CommandCode CLI bundle；加载 private credential，diagnostics 保持 redacted。

## 安装

### Linux rootless installer

installer 面向 Linux user systemd；由于 CommandCode CLI 1.14.0，需要 Node.js 22+。它会在可用时导入 CLI auth，把 private state 写入 `~/.config/commandcode-bridge`，安装到 `~/.local/share/commandcode-bridge`，安全默认值为 `127.0.0.1:9992`。只有在启用 `BRIDGE_API_KEY` 的可信 LAN/VPN/tailnet/firewall/reverse proxy 后才使用 `0.0.0.0`。登录前启动使用 `sudo loginctl enable-linger "$USER"`；卸载使用 `./uninstall.sh` 或 `./uninstall.sh --purge-config`。

```bash
./install.sh
./install.sh --yes --host 127.0.0.1 --port 9992
./install.sh --host 0.0.0.0 --port 9992
```

### 手动 source 运行

bridge runtime 支持 Node.js 20+，但安装或使用当前 CommandCode CLI 需要 Node.js 22+。用 `cmd login` 认证官方 `command-code` npm package，或提供等价 credential。官方安装：<https://commandcode.ai/install>。

```bash
git clone <your-commandcode-bridge-repository-url> commandcode-bridge
cd commandcode-bridge
npm install --include=dev
cp .env.example .env
npm run build
npm start
```

### Docker

Docker 与 Compose 需要 full source checkout；Dockerfile 会在生成 runtime image 前验证并构建。参见[部署指南](docs/DEPLOYMENT.md)和 [`release/docker-compose.yml`](release/docker-compose.yml)。

```bash
docker build -t commandcode-bridge .
docker run --rm -p 127.0.0.1:9992:9992 \
  -e HOST=0.0.0.0 \
  -e COMMANDCODE_API_KEY="$COMMANDCODE_API_KEY" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  commandcode-bridge
```

## 用法

### 验证并调用 API

```bash
export BRIDGE_API_KEY='<same value as the bridge runtime>'
curl -fsS http://127.0.0.1:9992/health | jq
curl -fsS http://127.0.0.1:9992/v1/models \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
curl -fsS http://127.0.0.1:9992/v1/models/deepseek%2Fdeepseek-v4-pro \
  -H "Authorization: Bearer $BRIDGE_API_KEY" | jq
```

`/health` 是 public 且 secret-free。`GET /v1/models` 列出 available model，`GET /v1/models/:model` 返回一个 available model 或 `404 model_not_found`；带 slash 的 ID 必须 URL-encode。`POST /v1/chat/completions` 返回 OpenAI completion JSON；`stream: true` 返回 SSE，`stream_options.include_usage` 添加最终 usage chunk。支持 `developer`、`system`、`user`、`assistant`、`tool` role。支持 tool schema 与 emitted call；forced `tool_choice` 仅允许省略、`"auto"` 或 `"none"`。

```bash
curl -sS http://127.0.0.1:9992/v1/chat/completions \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Reply exactly: OK"}],
    "max_tokens": 64,
    "temperature": 0
  }' | jq
```

### API 表面

| Method | Path                             | Behavior                                                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET`  | `/health`                        | Public、secret-free health/runtime summary。                                               |
| `GET`  | `/dashboard`                     | 可信 network 的 public read-only shell。                                                   |
| `GET`  | `/v1/models`                     | 配置 `BRIDGE_API_KEY` 时认证；列出 available model。                                       |
| `GET`  | `/v1/models/:model`              | 配置时认证；查询一个 available model。                                                     |
| `POST` | `/v1/chat/completions`           | 配置时认证；streaming/non-streaming chat。                                                 |
| `GET`  | `/admin/config`                  | 可信 network 上的 public redacted dashboard state。                                        |
| `GET`  | `/admin/commandcode/credentials` | Public redacted diagnostics；`?refresh=true` 刷新 billing。                                |
| `PUT`  | `/admin/config`                  | 需要当前 `BRIDGE_API_KEY`；无 key runtime 仅可在 peer 与 Host 都为 loopback 时 bootstrap。 |
| `POST` | `/admin/restart`                 | 使用相同认证规则；restart 完成前旧 key 仍是 current key。                                  |

### Model metadata 与准确 catalog

每个 model object 包含 `id`、`object`、`created` 和 provider-derived `owned_by`。已知 context 同时写入 `context_window`、`context_length`、`max_context_length`。恰有 5 个模型没有公开 context，因此省略全部三个 capacity field。以下是准确的 1.14.0 canonical catalog；“默认启用”表示 built-in enabled state。

| Provider          | Canonical model ID                    |   Context | 默认启用 |
| ----------------- | ------------------------------------- | --------: | :------: |
| DeepSeek          | `deepseek/deepseek-v4-pro`            | 1,000,000 |    是    |
| DeepSeek          | `deepseek/deepseek-v4-flash`          | 1,000,000 |    是    |
| Moonshot          | `moonshotai/Kimi-K3`                  | 1,000,000 |    否    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code`           |   256,000 |    否    |
| Moonshot          | `moonshotai/Kimi-K2.7-Code-Highspeed` |   262,000 |    否    |
| Moonshot          | `moonshotai/Kimi-K2.6`                |   256,000 |    是    |
| Moonshot          | `moonshotai/Kimi-K2.5`                |   256,000 |    否    |
| Z.ai              | `zai-org/GLM-5.2`                     | 1,000,000 |    否    |
| Z.ai              | `zai-org/GLM-5.2-Fast`                | 1,000,000 |    否    |
| Z.ai              | `zai-org/GLM-5.1`                     |    未公布 |    是    |
| Z.ai              | `zai-org/GLM-5`                       |   200,000 |    否    |
| MiniMax           | `MiniMaxAI/MiniMax-M3`                | 1,000,000 |    否    |
| MiniMax           | `MiniMaxAI/MiniMax-M2.7`              |    未公布 |    是    |
| MiniMax           | `MiniMaxAI/MiniMax-M2.5`              |   200,000 |    否    |
| Xiaomi            | `xiaomi/mimo-v2.5-pro`                | 1,000,000 |    否    |
| Xiaomi            | `xiaomi/mimo-v2.5`                    | 1,000,000 |    否    |
| Qwen              | `Qwen/Qwen3.8-Max`                    | 1,000,000 |    否    |
| Qwen              | `Qwen/Qwen3.7-Max`                    | 1,000,000 |    否    |
| Qwen              | `Qwen/Qwen3.7-Plus`                   | 1,000,000 |    否    |
| Qwen              | `Qwen/Qwen3.7-Flash`                  | 1,000,000 |    否    |
| Qwen              | `Qwen/Qwen3.6-Max-Preview`            |    未公布 |    否    |
| Qwen              | `Qwen/Qwen3.6-Plus`                   |    未公布 |    是    |
| StepFun           | `stepfun/Step-3.7-Flash`              |   256,000 |    否    |
| StepFun           | `stepfun/Step-3.5-Flash`              | 1,000,000 |    否    |
| Tencent           | `tencent/hy3-paid`                    |   262,000 |    否    |
| NVIDIA            | `nvidia/nemotron-3-ultra-550b-a55b`   | 1,000,000 |    否    |
| Thinking Machines | `thinkingmachines/inkling`            |   256,000 |    否    |
| Thinking Machines | `thinkingmachines/inkling-small`      | 1,000,000 |    否    |
| Poolside          | `poolside/laguna-s-2.1-free`          |   256,000 |    否    |
| Anthropic         | `claude-sonnet-5`                     | 1,000,000 |    否    |
| Anthropic         | `claude-sonnet-4-6`                   | 1,000,000 |    否    |
| Anthropic         | `claude-fable-5`                      | 1,000,000 |    否    |
| Anthropic         | `claude-opus-5`                       | 1,000,000 |    否    |
| Anthropic         | `claude-opus-4-8`                     | 1,000,000 |    否    |
| Anthropic         | `claude-opus-4-7`                     | 1,000,000 |    否    |
| Anthropic         | `claude-haiku-4-5-20251001`           |   200,000 |    否    |
| OpenAI            | `gpt-5.6-sol`                         | 1,050,000 |    否    |
| OpenAI            | `gpt-5.6-terra`                       | 1,050,000 |    否    |
| OpenAI            | `gpt-5.6-luna`                        | 1,050,000 |    否    |
| OpenAI            | `gpt-5.5`                             |    未公布 |    否    |
| OpenAI            | `gpt-5.4`                             |   400,000 |    否    |
| OpenAI            | `gpt-5.3-codex`                       |   400,000 |    否    |
| OpenAI            | `gpt-5.4-mini`                        |   400,000 |    否    |
| Google            | `google/gemini-3.6-flash`             | 1,000,000 |    否    |
| Google            | `google/gemini-3.5-flash`             | 1,000,000 |    否    |
| Google            | `google/gemini-3.5-flash-lite`        | 1,000,000 |    否    |
| Google            | `google/gemini-3.1-flash-lite`        | 1,000,000 |    否    |
| Sakana            | `sakana/fugu-ultra`                   | 1,000,000 |    否    |
| Meta              | `meta/muse-spark-1.1`                 | 1,050,000 |    否    |
| Meta              | `meta/muse-spark-1.2`                 | 1,050,000 |    否    |
| Meta              | `meta/muse-spark-1.2-contributor`     | 1,050,000 |    否    |
| xAI               | `xai/grok-4.5`                        |   500,000 |    否    |

### Dashboard 与 credential routing

打开 `http://127.0.0.1:9992/dashboard`。移动优先 UI 以韩文为 fallback，并把韩文/英文/中文 locale 存入 `localStorage`。它显示 online/version，编辑 bind、client key、routing、每 key concurrency，管理和刷新 redacted credential；model catalog 按 provider fold，显示 enabled/total count。空 secret field 保留原 key。Save 写入 JSON，restart 后应用。永不返回 raw upstream key。

`daily_burn_priority` 是按 required daily burn 加权的默认值，`depletion_aware` 是 legacy alias；`balance_priority` 偏好 usable balance；`round_robin` 平滑按 weight 轮换；`drain_first` 优先耗尽剩余期限最短的 eligible key，再移动到下一个。所有 policy 先缩小到 1 天内到期的 eligible credential。Manual disable、`allowedModels`、in-flight cap、exhausted/expired balance、auth failure、429/5xx/timeout cooldown 都可排除 key。每个请求固定一个 key；仅在 visible output 前 failover。

### 配置与运维

从持久化的 1.3.1 dashboard catalog 升级时，会保留当前 model 的 enabled state 和所有 custom model，并用 1.14.0 canonical 定义刷新 built-in metadata。6 个已退役的 1.3.1 ID 不会作为 unknown upstream model 转发；若 default 已退役，则安全回退到 `deepseek/deepseek-v4-pro`。

浏览器已保存 key 的现有用户可继续使用。新浏览器在保存或重启前，需要在 **当前管理员 API Key** 中输入一次现有 key。无 key runtime 仅在真实 loopback 连接且 Host 也是 loopback 时允许 bootstrap。

Credential 优先级为 `COMMANDCODE_CREDENTIALS_FILE`、`COMMANDCODE_CREDENTIALS`/`COMMANDCODE_API_KEYS`、`COMMANDCODE_API_KEY`、CLI auth file。核心默认值：`HOST=127.0.0.1`、`PORT=9992`、`COMMANDCODE_ROUTING_POLICY=daily_burn_priority`、`COMMANDCODE_MAX_IN_FLIGHT_PER_CREDENTIAL=4`、`COMMANDCODE_CLI_VERSION=1.14.0`、`COMMANDCODE_TIMEOUT_MS=300000`、`COMMANDCODE_EMPTY_VISIBLE_RESPONSE_POLICY=error_on_length`。设置后 `BRIDGE_API_KEY` 保护 `/v1/*`；client 可使用 Bearer 或 `x-api-key`。用 `chmod 600` 保护 credential JSON。Balance alert 默认关闭。可选 `commandcode-router` 用于多个 bridge host 的 least-in-flight routing。

## 工作原理

1. 认证并验证 OpenAI-shaped request。

2. 在 enabled catalog 中解析 model alias。

3. 过滤 disabled、scoped、saturated、cooldown、expired、exhausted credential。

4. 优先 1 天内到期的 eligible credential，再应用 configured policy。

5. 固定一个 credential，直接调用 CommandCode `POST /alpha/generate`。

6. 把 stream event 转为含 supported tool 与 optional usage 的 OpenAI JSON/SSE。

7. 通过 tests、`npm run verify`、`/health`、model discovery、`npm run smoke` 验证。

## 仓库布局

```text
src/                 bridge, catalog, routing, dashboard, and API implementation
tests/               deterministic contract and behavior tests
docs/                architecture, deployment, security, and documentation assets
release/             Compose and production deployment material
install.sh           Linux rootless user-systemd installer
```

开发验证使用 `npm run verify`，runtime 验证使用 `npm run smoke`。`SMOKE_ACCEPT_UPSTREAM_ERRORS=1 npm run smoke` 在 credit 阻止 generation 时验证 fail-closed routing，但不是 generation-readiness canary。

## 当前限制

- **可信 network 边界。** Read-only dashboard endpoint 会显示 redacted 运维 metadata；只放在 localhost 或 trusted VPN/tailnet，离开 localhost 时设置 `BRIDGE_API_KEY`。

- **Alpha upstream 依赖。** CommandCode `/alpha/generate` 与 billing path 可能变化；固定 `COMMANDCODE_CLI_VERSION` 并对升级运行 smoke test。

- **不绕过 account limit。** billing、credit、rate limit、terms 仍适用；监控 diagnostics 和 eligible credential。

- **不虚构 capacity。** 5 个 model context 未知；字段缺失表示 unknown，而不是 unlimited。

不要提交 `.env`、CLI auth file、credential JSON、key、billing detail、private topology 或 dashboard export。本项目不是 public proxy 或 internet control plane。参见[安全指南](docs/SECURITY.md)。

## 许可证

CommandCode Bridge 使用 [MIT License](LICENSE)。CommandCode 是有自身 terms 的独立 software；本 repository 不包含或重新打包其 proprietary CLI bundle。

<p align="center"><em>CommandCode Bridge · OpenAI-compatible CommandCode access 的可信边界.</em></p>
