# dsh-antigravity-kit

在 [DSH](https://github.com/deepseek-ai/deepseek-harness) 中使用正在运行的 Google Antigravity 客户端执行任务，并查看账户模型额度。

不需要 Gemini API Key：任务通过 Antigravity 自带的 `agentapi` 创建真实对话，复用客户端登录态。

> 本项目名为 **dsh-antigravity-kit**，包含页面插件与子代理 worker 两个包。

## 组成

| 包 | 作用 |
|---|---|
| `packages/dsh-antigravity-kit` | DSH 页面插件：额度面板、模型选择、任务执行 |
| `packages/dsh-antigravity-kit-worker` | 子代理 worker：给父级和子代理提供 `antigravity_run` / `antigravity_quota` 工具 |
| `python/` | 本机服务：桥接 Antigravity `agentapi` 与额度接口 |

页面通过 `http://127.0.0.1:8765` 与本机服务通信，不接入 DSH 的共享 remote 服务，避免影响账户与设置页。

## 前置条件

- Windows
- 正在运行的 Antigravity 客户端（已登录）
- Python 3.10+

## 安装

### 1. Python 环境

```bat
python -m venv .venv
.venv\Scripts\python -m pip install httpx
```

把 `python/` 下的两个脚本放到一个目录，例如 `%LOCALAPPDATA%\AntigravitySDK`，并让 `.venv` 位于同一目录。

设置环境变量（可选，默认会自动探测）：

```bat
setx ANTIGRAVITY_SDK_HOME "%LOCALAPPDATA%\AntigravitySDK"
```

### 2. DSH 插件

```bat
dsh plugin --profile desktop add <本仓库 packages/dsh-antigravity-kit 的绝对路径>
dsh plugin --profile desktop add <本仓库 packages/dsh-antigravity-kit-worker 的绝对路径>
```

然后重启 DSH。

## 使用

### 页面

侧边栏 **Antigravity** 图标打开控制台：

- 模型额度：周额度、5 小时额度、剩余百分比、重置时间
- 模型选择：Flash Lite / Flash / Pro
- 工作区与任务输入
- 执行结果显示在页面内，并给出 Antigravity 对话 ID

### 工具

父级与子代理都可使用：

- `antigravity_run`：把任务交给 Antigravity 执行
- `antigravity_quota`：查询账户模型额度

### 命令行

```bat
python antigravity_bridge.py --workspace C:\projects\demo "任务内容"
python antigravity_bridge.py --quota
```

## 已知限制

- `agentapi` 只接受 `flash_lite` / `flash` / `pro` 三档；Antigravity 界面的 High/Medium/Low 未通过该接口开放。
- 这是 Antigravity 的内部接口，客户端升级后可能需要适配。
- 任务在用户自己的 Antigravity 账号下运行，会消耗其额度。
- 页面服务仅监听 `127.0.0.1`。

## License

MIT
