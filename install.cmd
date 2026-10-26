@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo === dsh-antigravity-kit installer ===
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [X] 未找到 python。请先安装 Python 3.10+ 并加入 PATH。
  exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [i] %%v

where dsh >nul 2>nul
if errorlevel 1 (
  echo [!] PATH 中没有 dsh 命令。
  echo     桌面版请使用安装目录下的 dsh.cmd，例如：
  echo     "%%LOCALAPPDATA%%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
  set /p DSHCLI=请输入 dsh.cmd 的完整路径（直接回车跳过插件安装）:
) else (
  set "DSHCLI=dsh"
)

if not "!DSHCLI!"=="" (
  echo.
  echo [1/2] 安装页面插件...
  call "!DSHCLI!" plugin --profile desktop add "%~dp0packages\dsh-antigravity-kit"
  echo [2/2] 安装子代理 worker...
  call "!DSHCLI!" plugin --profile desktop add "%~dp0packages\dsh-antigravity-kit-worker"
)

echo.
echo === 完成 ===
echo 请完全退出并重新打开 DSH，然后点击侧边栏的 Antigravity 图标。
echo 若页面提示服务不可达，检查 Antigravity 客户端是否已登录并正在运行。
endlocal
