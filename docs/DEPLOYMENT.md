# 迭页初步部署

这一阶段使用独立的 FastAPI 应用与 Caddy 静态入口。保持原有 Node 本地版本可运行，服务器发布采用 Python。

## 隔离与访问

- Compose 项目固定为 `dieye-mvp`，服务为 `api`、`web`，使用自己的默认网络。
- 发布目录为 `~/apps/dieye-mvp/releases/<commit-sha>`，`current` 指向通过检查的发布。
- 只将 Caddy 绑定到服务器 `127.0.0.1:18787`；FastAPI 的 8000 端口只在自己的容器网络内。
- 初期通过 SSH 隧道访问，传输由 SSH 加密；这个私有入口使用 HTTP，不配置公网域名或证书。
- API：512MiB、0.5 CPU；Caddy：128MiB、0.25 CPU。总内存上限 640MiB，单个 Uvicorn worker。
- 独立依赖、非 root 容器、只读根文件系统、有限 tmpfs；每个服务最多两份 5MB 日志。
- 模型配置只在发布的 `deploy/.env`，权限 600，不进入镜像、发布包或 Git。

部署不需要修改已有项目的 Compose、环境文件、容器或数据卷，也不需要调整主机防火墙、SSH 服务或 Docker 守护进程。共享机器仍有资源竞争；上限用于限制新增服务的占用，实际占用应以 docker stats 为准。

## 本地开发与测试

Node 22.22.2+，Python 3.12。使用 uv：

```powershell
uv venv --python 3.12 .venv
uv pip sync backend/requirements.txt --python .venv\Scripts\python.exe
npm install
npm run dev:python
```

Linux 虚拟环境路径为 `.venv/bin/python`。可通过 PYTHON_BIN 指定解释器。网页仍在 localhost:5173，API 默认 8787；原来的 `npm run dev` 保留 Node 模式。

```powershell
npm test
npm run test:python
npm run build
```

Python 依赖已锁定在 backend/requirements.txt；Docker 基础镜像按 digest 固定，生产不加载 PyTorch 或本地大模型。

## 制作发布

先提交源代码，工作区必须干净：

```powershell
npm run build
node scripts/package-deploy.mjs
```

发布包位于 .local，包含 backend、deploy、webdist 与 release.json；release.json 记录源码提交和文件 SHA-256。包内只有 .env.example，实际 .env 由服务器单独维护。

上传后应验证归档内文件都是相对路径、无符号链接、无越界条目，再解压到自己的 releases 目录。完成后运行：

```bash
python3 ~/apps/dieye-mvp/releases/<commit-sha>/deploy/activate.py
```

激活脚本验证全部文件摘要、独立端口，创建自身配置，构建镜像，运行 Python 测试，再只启动 dieye-mvp 的服务。通过 health 与提交号检查后切换 current。更新发布会继承迭页上一版的 .env，不读取其他项目配置。

初始模型参数留空，为明确标记的演示模式。配置真实模型时，在 current/deploy/.env 写入 LLM_BASE_URL、LLM_MODEL、LLM_API_KEY，再进入该目录执行 `sudo docker compose -p dieye-mvp up -d --force-recreate api`。密钥不要放进联调 HTML。

## SSH 隧道

Windows 可运行仓库内 deploy/tunnel.ps1：

```powershell
.\deploy\tunnel.ps1 -Server <服务器地址> -User ubuntu -IdentityFile <私钥路径> -KnownHostsFile <已核对的known_hosts路径>
```

也可使用通用 SSH 命令：

```bash
ssh -N -L 127.0.0.1:18787:127.0.0.1:18787 -i <私钥路径> -o UserKnownHostsFile=<known_hosts路径> -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes ubuntu@<服务器地址>
```

保持隧道运行后打开：

- 阅读器：`http://localhost:18787/`
- 联调 HTML：`http://localhost:18787/integration.html`
- Swagger：`http://localhost:18787/api/docs`
- OpenAPI：`http://localhost:18787/api/openapi.json`
- 接口说明：`http://localhost:18787/api-docs.md`

localhost:18787 与 localhost:5173 使用不同的 IndexedDB 书库。没有自动迁移或云同步。

## 部署验收与停止

部署前后记录已有容器的 ID、启动时间、重启次数、健康状态，以及已有 systemd 服务的 PID 和运行状态。保存这些记录到 .local，不公开其他项目的配置。

通过隧道执行前端完整验证：

```powershell
$env:DEPLOYED_BASE_URL = 'http://localhost:18787'
npm run test:e2e
```

检查新服务：

```bash
cd ~/apps/dieye-mvp/current/deploy
sudo docker compose -p dieye-mvp ps
sudo docker compose -p dieye-mvp logs --tail=50
sudo docker stats --no-stream
```

停止迭页：在上述目录运行 `sudo docker compose -p dieye-mvp stop`。回退时进入前一个发布的 deploy 目录，用相同项目名启动其 compose；确认健康后调整 current 指向。首次部署无旧迭页版本时直接停止本项目即可。不要运行全局 prune 或操作其他项目的 Compose。

尚未提供真实模型凭据，因此初期验收覆盖演示流程与模拟供应商的真实接口协议，不代表真实改写质量。公网 HTTPS、账号、云同步和多 worker 不属于本次发布。
