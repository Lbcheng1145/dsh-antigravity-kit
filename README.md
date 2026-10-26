# dsh-antigravity-kit

在 [DSH](https://github.com/deepseek-ai/deepseek-harness) 中使用正在运行的 Google Antigravity 客户端执行任务，并查看账户模型额度。

不需要 Gemini API Key：任务通过 Antigravity 自带的 `agentapi` 创建真实对话，复用客户端登录态。

## 组成

| 包 | 作用 |
|---|---|
| `packages/dsh-antigravity-kit` | 页面插件：额度面板、模型选择、任务执行；内含 Python 服务 |
| `packages/dsh-antigravity-kit-worker` | 子代理 worker：提供 `antigravity_run` / `antigravity_quota` 工具 |

页面通过 `http://127.0.0.1:8765` 与本机服务通信，不接入 DSH 共享 remote 服务，避免影响账户与设置页。

## 前置条件

- Windows
- 正在运行的 Antigravity 客户端（已登录）
- Python 3.10+（**无需安装任何第三方包**，只用标准库）

## 安装

### 方式一：一键脚本

```bat
install.cmd
```

脚本会检测 Python 和 DSH，并安装两个插件。

### 方式二：手动

```bat
dsh plugin --profile desktop add <仓库绝对路径>\packages\dsh-antigravity-kit
dsh plugin --profile desktop add <仓库绝对路径>\packages\dsh-antigravity-kit-worker
```

装完**完全退出并重新打开 DSH**。

## 使用

### 页面

侧边栏 **Antigravity** 图标打开控制台：

- 模型额度：周额度、5 小时额度、剩余百分比、重置时间
- 模型选择：Flash Lite / Flash / Pro
- 工作区与任务输入
- 执行结果显示在页面内，并给出 Antigravity 对话 ID

### 工具

父级与子代理都可使用：

- `antigravity_run`：把任务交给 Antigravity 执行，返回 `conversation_id`
- `antigravity_quota`：查询账户模型额度

**多轮对话**：把上一次返回的 `conversation_id` 作为 `conversation_id` 参数再调用 `antigravity_run`，即可在同一 Antigravity 会话里继续追问，上下文会保留。

### 命令行

```bat
python packages\dsh-antigravity-kit\python\antigravity_bridge.py --workspace C:\projects\demo "任务内容"
python packages\dsh-antigravity-kit\python\antigravity_bridge.py --quota

:: 多轮：沿用上一次返回的 conversation_id
python packages\dsh-antigravity-kit\python\antigravity_bridge.py --conversation <conversation_id> "继续追问"
```

## 配置

全部可选，默认即可工作：

| 环境变量 | 说明 |
|---|---|
| `ANTIGRAVITY_DASHBOARD_PORT` | 本机服务端口，默认 8765 |
| `ANTIGRAVITY_SDK_HOME` | Python 服务所在目录；默认使用包内 `python/` |
| `ANTIGRAVITY_PYTHONW` | 指定解释器；默认用包内 venv，其次系统 `pythonw.exe` |

## 排查

| 现象 | 处理 |
|---|---|
| 侧边栏没有图标 | 确认插件已安装且已重启 DSH |
| 页面提示服务不可达 | 确认 Antigravity 客户端已登录并运行 |
| 额度为空 | 客户端未登录，或 language server 未就绪，稍后刷新 |
| 端口被占用 | 设置 `ANTIGRAVITY_DASHBOARD_PORT` 换端口 |

## 已知限制

- `agentapi` 只接受 `flash_lite` / `flash` / `pro` 三档；Antigravity 界面的 High/Medium/Low 未通过该接口开放。
- 这是 Antigravity 的内部接口，客户端升级后可能需要适配。
- 任务在用户自己的 Antigravity 账号下运行，会消耗其额度。
- 页面服务仅监听 `127.0.0.1`。

## License

MIT
