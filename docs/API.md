# 迭页生成 API

版本：1.0.0。后端为 Python 3.12 + FastAPI + HTTPX，与现有 React 客户端兼容。

初步部署通过 SSH 隧道访问 `http://localhost:18787`。联调页为 `/integration.html`，OpenAPI 为 `/api/openapi.json`，Swagger UI 为 `/api/docs`。Swagger UI 默认从 CDN 加载界面资源；联调 HTML 和本文不依赖该 CDN。

## 职责

后端只生成正文，不保存故事、不创建世界线，也不提供云同步。前端负责原稿、版本、选区锚点、阅读进度和 IndexedDB 持久化。生成时相关文本会经本服务发送到配置的模型服务。

模型地址、名称与密钥仅由服务端环境变量配置，浏览器不得传入 API Key。初步部署由 SSH 访问控制保护，没有产品账号体系。

## GET /api/health

服务存活检查，不会调用模型。

```json
{"status":"ok","service":"dieye","release":"部署源码提交 SHA","mode":"demo"}
```

`status=ok` 不代表模型供应商可用；请通过真实生成确认模型连接。

## GET /api/config

```json
{
  "mode": "demo",
  "ready": true,
  "message": "演示模式 · 使用预设故事片段",
  "contextChars": 18000
}
```

`mode` 为 `demo` 或 `live`；`ready` 表示本地配置是否完整，不表示供应商已通过连接测试。完全未配置模型时才使用演示模板；部分配置返回 `live / ready=false`。响应不包含密钥或模型服务地址。

## POST /api/generate

请求头：`Content-Type: application/json`。三种任务使用同一接口。

```json
{
  "operation": "rewrite",
  "versionId": "original-version-id",
  "title": "雨停之前",
  "intent": "让苏晚活下来",
  "mode": "minimal",
  "context": {
    "before": "苏晚站在栈桥尽头。\n\n",
    "selected": "木板断开，她落入水中。",
    "after": "搜救队没能找到她。",
    "background": "原创片段。林舟与苏晚寻找事故真相。",
    "genres": []
  }
}
```

| 字段 | 约定 |
| --- | --- |
| operation | `create` 创建 / `rewrite` 改写 / `continue` 续写 |
| versionId | 可选，当前源版本 ID，最多 100 UTF-16 单位 |
| title | 故事名称，最多 80；创建时可为空 |
| intent | 自然语言意图，最多 600；创建、改写必须非空，续写可留空 |
| mode | `minimal` 最小改变 / `reasonable` 合理改变 / `new-world` 新世界线 |
| context.before | 干预点之前的完整正文；续写时为当前版本全部正文；创建时为空 |
| context.selected | 改写片段，最多 2,000；改写任务必须非空 |
| context.after | 原版选区之后的正文，用于因果约束；不自动拼接回新世界线 |
| context.background | 背景最多 1,200；字段必须提供，可为空 |
| context.genres | 最多 3 个题材，每个最多 10；可为空数组 |

`before + selected + after` 最多 120,000 UTF-16 单位。选区起点等于 `before.length`，终点等于 `before.length + selected.length`，采用 JavaScript UTF-16 偏移，终点不包含在选区内。Python 端按相同规则计算，emoji 仍占两个单位；重复文本不使用第一次字符串匹配定位。

长正文由服务端截取上下文窗口后发往模型，但选区位置仍是完整源版本的偏移。默认窗口预算 18,000 字符单位，按字符估计，不等同于供应商 token 上限。

成功：HTTP 200。

```json
{
  "title": "她回到了岸上",
  "text": "她抓住了救生绳。\n\n雨还在下，他们一起走向灯塔。",
  "mode": "demo"
}
```

真实生成返回 `mode=live` 并包含 `model`。正文最多 12,000 UTF-16 单位，使用纯文本渲染，不执行 HTML。

改写结果只包含“从选区起点开始的替代后续”；调用方保留前缀并创建新版本，不能拼回可能冲突的旧后文。续写结果只包含追加正文；原版续写应先分叉，再追加。创建结果是故事开头。

## 错误与重试

失败返回 `{"error":"可展示给用户的消息"}`，不会用演示结果代替失败的真实模型调用。

| HTTP | 含义与处理 |
| --- | --- |
| 400 | JSON、字段类型、意图或长度不符合约定，修改输入 |
| 403 | Origin 未加入 SITE_ORIGINS |
| 413 | 请求体超过 512,000 字节，缩短正文 |
| 415 | 请求类型不是 application/json |
| 429 | 全服务并发或一分钟次数达到上限；带 Retry-After: 60 |
| 499 | 客户端断开，服务端取消正在等待的生成 |
| 502 | 供应商错误、超时、连接失败或正文格式不正确 |
| 503 | 已配置部分模型信息，但配置不完整 |
| 500 | 未预期的服务错误 |

默认一个 worker、同时最多 2 次生成、全服务每分钟最多 60 次。窗口、令牌数、超时和频率可通过部署环境调整。API 不提供生成幂等键；它不写入版本。前端必须阻止重复提交，并在切页、切版本或取消后忽略旧响应。重试可能得到新的正文。

客户端用 AbortController 取消 fetch；服务端监测连接断开并取消 HTTPX 等待。模型供应商可能已处理请求或计费，取消本地等待不保证撤销供应商任务。

## 联调方式

通过服务打开 `/integration.html`，检查配置，载入创建 / 改写 / 续写样例后发送。页面保留失败时的输入与上次成功正文，支持取消与重试，也可将生成结果载入续写请求。

浏览器同源访问直接可用。跨域测试使用 `SITE_ORIGINS` 明确列出页面的协议、主机和端口；没有通配符。file:// 的 null 来源默认不允许。curl 或服务端客户端可不带 Origin；Origin 检查不是身份认证，所以公网发布前仍需独立访问控制。
