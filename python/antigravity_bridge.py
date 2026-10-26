#!/usr/bin/env python3
r"""Call the running Antigravity client through its internal agentapi.

This does not use a Gemini API key. It creates a real conversation in the
Antigravity app and reads the final assistant text from the conversation DB.

Usage:
    antigravity-bridge.cmd --workspace C:\projects\demo "your task"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
import os
import re
import sqlite3
import subprocess
import sys
import time
import traceback
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
POWERSHELL = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

# Placeholder id used to probe a port: no real conversation can match it.
PROBE_CONVERSATION_ID = "0" * 8 + "-0000-0000-0000-" + "0" * 12


def _ensure_env() -> None:
    if not os.environ.get("USERPROFILE"):
        username = os.environ.get("USERNAME") or os.environ.get("USER")
        if not username:
            raise RuntimeError("无法确定用户目录，请设置 USERPROFILE 环境变量")
        os.environ["USERPROFILE"] = str(Path("C:/Users") / username)
    os.environ.setdefault("HOME", os.environ["USERPROFILE"])
    os.environ.setdefault("SYSTEMROOT", r"C:\Windows")
    if not os.environ.get("PATH"):
        os.environ["PATH"] = r"C:\Windows\System32;C:\Windows"




CREATE_NO_WINDOW = 0x08000000


def _hidden_kwargs() -> dict[str, Any]:
    """Suppress the console window Windows would otherwise flash for a child process."""
    if os.name != "nt":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return {"creationflags": CREATE_NO_WINDOW, "startupinfo": startupinfo}

def _powershell_json(script: str) -> Any:
    proc = subprocess.run(
        [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        **_hidden_kwargs(),
    )
    raw = (proc.stdout or "").lstrip("\ufeff").strip()
    if not raw:
        raise RuntimeError((proc.stderr or "PowerShell returned no output").strip())
    return json.loads(raw)


def _commandline_arg(cmdline: str, name: str) -> str | None:
    match = re.search(rf"{re.escape(name)}(?:=|\s+)(\"[^\"]+\"|\S+)", cmdline)
    if not match:
        return None
    return match.group(1).strip('"')


def _processes() -> list[dict[str, Any]]:
    script = r'''
$procs = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^language_server(_windows_x64)?\.exe$' -and $_.CommandLine -match '--csrf_token'
} | Select-Object ProcessId, Name, CommandLine, ExecutablePath)
$pids = @($procs | ForEach-Object { $_.ProcessId })
$ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $pids -contains $_.OwningProcess } |
  Select-Object LocalPort, OwningProcess)
@{ procs = @($procs); ports = @($ports) } | ConvertTo-Json -Depth 4 -Compress
'''
    data = _powershell_json(script)
    procs = data.get("procs") or []
    ports = data.get("ports") or []
    if isinstance(procs, dict):
        procs = [procs]
    if isinstance(ports, dict):
        ports = [ports]
    result: list[dict[str, Any]] = []
    for p in procs:
        cmdline = p.get("CommandLine") or ""
        token = _commandline_arg(cmdline, "--csrf_token")
        exe = p.get("ExecutablePath")
        if not token or not exe or not Path(exe).is_file():
            continue
        app_dir = _commandline_arg(cmdline, "--app_data_dir") or "antigravity"
        version = _commandline_arg(cmdline, "--override_ide_version") or "1.107.0"
        pid = int(p.get("ProcessId") or 0)
        my_ports = sorted(
            {int(x.get("LocalPort")) for x in ports if int(x.get("OwningProcess") or 0) == pid}
        )
        result.append(
            {
                "pid": pid,
                "name": p.get("Name") or Path(exe).name,
                "exe": exe,
                "cmdline": cmdline,
                "token": token,
                "app_data_dir": app_dir,
                "version": version,
                "ports": my_ports,
            }
        )
    return result


def _normalize_folder_uri(uri: str) -> str:
    value = urllib.parse.unquote(uri or "")
    if value.startswith("file:///"):
        value = value[8:]
    elif value.startswith("file://"):
        value = value[7:]
    value = value.replace("/", "\\")
    try:
        return str(Path(value).resolve()).lower()
    except OSError:
        return value.lower()


def _find_project_id(workspace: Path) -> str | None:
    projects_dir = Path.home() / ".gemini" / "config" / "projects"
    if not projects_dir.is_dir():
        return None
    target = str(workspace.resolve()).lower()
    fallback: str | None = None
    for p in sorted(projects_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        pid = data.get("id")
        if not pid:
            continue
        if fallback is None:
            fallback = pid
        for resource in (data.get("projectResources") or {}).get("resources") or []:
            if _normalize_folder_uri(resource.get("folderUri", "")) == target:
                return pid
    return fallback


def _env_for(target: dict[str, Any], project_id: str | None) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        {
            "ANTIGRAVITY_LS_ADDRESS": "",
            "ANTIGRAVITY_CSRF_TOKEN": target["token"],
            "ANTIGRAVITY_LS_VER": target["version"],
            "ANTIGRAVITY_APP_DATA_DIR": target["app_data_dir"],
        }
    )
    if project_id:
        env["ANTIGRAVITY_PROJECT_ID"] = project_id
    return env


def _test_port(target: dict[str, Any], port: int) -> bool:
    env = _env_for(target, None)
    env["ANTIGRAVITY_LS_ADDRESS"] = f"127.0.0.1:{port}"
    try:
        proc = subprocess.run(
            [target["exe"], "agentapi", "get-conversation-metadata", PROBE_CONVERSATION_ID],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            env=env,
            **_hidden_kwargs(),
        )
    except Exception:
        return False
    output = ((proc.stdout or "") + (proc.stderr or "")).lower()
    bad = ("connection error", "unavailable", "dial tcp", "connection refused", "no such host")
    return not any(x in output for x in bad)


def _pick_target(workspace: Path, requested: str | None) -> tuple[dict[str, Any], str | None]:
    targets = _processes()
    if requested:
        targets = [t for t in targets if t["app_data_dir"] == requested]
    if not targets:
        raise RuntimeError(
            "没有找到正在运行的 Antigravity language_server。请先启动 Antigravity 客户端。"
        )
    project_id = _find_project_id(workspace)
    for target in targets:
        for port in target["ports"]:
            if _test_port(target, port):
                target["port"] = port
                target["project_id"] = project_id
                return target, project_id
    raise RuntimeError("找到了 Antigravity 进程，但 agentapi 端口连接失败。")


def _read_fields(data: bytes) -> list[tuple[int, int, Any]]:
    def read_varint(buf: bytes, pos: int) -> tuple[int, int]:
        value = 0
        shift = 0
        while pos < len(buf):
            byte = buf[pos]
            pos += 1
            value |= (byte & 0x7F) << shift
            if not byte & 0x80:
                return value, pos
            shift += 7
        raise ValueError("truncated varint")

    fields: list[tuple[int, int, Any]] = []
    pos = 0
    while pos < len(data):
        key, pos = read_varint(data, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = read_varint(data, pos)
        elif wire == 1:
            value = data[pos : pos + 8]
            pos += 8
        elif wire == 2:
            length, pos = read_varint(data, pos)
            value = data[pos : pos + length]
            pos += length
        elif wire == 5:
            value = data[pos : pos + 4]
            pos += 4
        else:
            break
        fields.append((number, wire, value))
    return fields


def _extract_text(payload: bytes) -> str:
    try:
        top = _read_fields(payload)
    except Exception:
        return ""
    for number, wire, value in top:
        if number != 20 or wire != 2:
            continue
        try:
            sub = _read_fields(value)
        except Exception:
            continue
        for sub_number, sub_wire, sub_value in sub:
            if sub_number == 1 and sub_wire == 2:
                try:
                    return sub_value.decode("utf-8").strip()
                except UnicodeDecodeError:
                    pass
        for sub_number, sub_wire, sub_value in sub:
            if sub_wire == 2:
                try:
                    text = sub_value.decode("utf-8").strip()
                except UnicodeDecodeError:
                    continue
                if text and all(c.isprintable() or c in "\n\r\t" for c in text):
                    return text
    return ""


def _conversation_state(conversation_id: str, app_data_dir: str) -> tuple[str, int, int]:
    """Return (latest assistant text, its step index, max step index)."""
    db = Path.home() / ".gemini" / app_data_dir / "conversations" / f"{conversation_id}.db"
    if not db.is_file():
        return "", -1, -1
    try:
        con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True, timeout=1)
        try:
            rows = list(
                con.execute(
                    "select idx, step_type, status, step_payload from steps order by idx"
                )
            )
        finally:
            con.close()
    except sqlite3.Error:
        return "", -1, -1
    text = ""
    text_idx = -1
    for idx, step_type, _status, payload in rows:
        if int(step_type) == 15 and payload:
            value = _extract_text(bytes(payload))
            if value:
                text = value
                text_idx = int(idx)
    max_idx = int(rows[-1][0]) if rows else -1
    return text, text_idx, max_idx


def _conversation_text(conversation_id: str, app_data_dir: str) -> tuple[str, int]:
    """Backward-compatible view: (latest assistant text, max step index)."""
    text, _text_idx, max_idx = _conversation_state(conversation_id, app_data_dir)
    return text, max_idx

def _wait_for_text(
    conversation_id: str,
    app_data_dir: str,
    timeout: float,
    quiet_seconds: float = 3.0,
    after_index: int = -1,
) -> str:
    """Wait for assistant text whose step index is greater than ``after_index``."""
    deadline = time.monotonic() + timeout
    text = ""
    text_idx = -1
    last_max = -1
    last_change = time.monotonic()
    while time.monotonic() < deadline:
        current_text, current_text_idx, max_idx = _conversation_state(conversation_id, app_data_dir)
        if max_idx != last_max:
            last_max = max_idx
            last_change = time.monotonic()
        if current_text and current_text_idx > after_index:
            if current_text != text:
                text = current_text
                text_idx = current_text_idx
                last_change = time.monotonic()
        if text and time.monotonic() - last_change >= quiet_seconds:
            return text
        time.sleep(0.5)
    if text:
        return text
    raise TimeoutError(
        f"等待 Antigravity 回复超时（会话 {conversation_id}）。"
        "任务可能仍在运行，可到 Antigravity 界面查看。"
    )



REUSE_TITLE = "DSH Worker"


def _find_conversation_by_title(title: str, app_data_dir: str) -> str:
    """Return the newest conversation whose stored title equals ``title``."""
    db = Path.home() / ".gemini" / app_data_dir / "conversation_summaries.db"
    if not db.is_file():
        return ""
    try:
        con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True, timeout=2)
        try:
            row = con.execute(
                "select conversation_id from conversation_summaries "
                "where title = ? order by last_modified_time desc limit 1",
                (title,),
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return ""
    return str(row[0]) if row else ""

def _send_message(
    target: dict[str, Any],
    env: dict[str, str],
    conversation_id: str,
    message: str,
    timeout: float,
) -> dict[str, Any]:
    """Append one message to an existing conversation and wait for its reply."""
    _before_text, before_idx = _conversation_text(conversation_id, target["app_data_dir"])
    proc = subprocess.run(
        [target["exe"], "agentapi", "send-message", conversation_id, message],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        env=env,
        **_hidden_kwargs(),
    )
    output = (proc.stdout or "").strip()
    if not output:
        raise RuntimeError((proc.stderr or "agentapi send-message returned no output").strip())
    data = json.loads(output)
    if data.get("error"):
        raise RuntimeError(data["error"])
    text = _wait_for_text(
        conversation_id,
        target["app_data_dir"],
        timeout,
        after_index=before_idx,
    )
    return {"conversation_id": conversation_id, "text": text}

def _quota(target: dict[str, Any]) -> dict[str, Any]:
    """Read the account's model quota summary from the local language server."""
    url = (
        f"http://127.0.0.1:{target['port']}/"
        "exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary"
    )
    body = json.dumps({}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "x-codeium-csrf-token": target["token"],
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    data = payload.get("response") or {}
    return {
        "groups": data.get("groups") or [],
        "description": data.get("description") or "",
    }


def _format_quota(quota: dict[str, Any]) -> str:
    lines: list[str] = []
    description = quota.get("description") or ""
    if description:
        lines.append(description)
        lines.append("")
    groups = quota.get("groups") or []
    if not groups:
        return "没有拿到额度信息。"
    for group in groups:
        lines.append(group.get("displayName") or "模型组")
        group_desc = group.get("description") or ""
        if group_desc:
            lines.append("  " + group_desc)
        buckets = group.get("buckets") or []
        if not buckets:
            lines.append("  - 无额度桶")
        for bucket in buckets:
            name = bucket.get("displayName") or bucket.get("bucketId") or "额度"
            fraction = bucket.get("remainingFraction")
            if isinstance(fraction, (int, float)):
                percent = f"{fraction * 100:.1f}%"
            else:
                percent = "未知"
            reset = bucket.get("resetTime") or ""
            reset_text = reset
            if reset:
                try:
                    parsed = datetime.fromisoformat(reset.replace("Z", "+00:00"))
                    reset_text = parsed.astimezone().strftime("%Y-%m-%d %H:%M")
                except Exception:
                    pass
            suffix = f"，重置于 {reset_text}" if reset_text else ""
            lines.append(f"  - {name}: 剩余 {percent}{suffix}")
    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="通过 Antigravity 内部 agentapi 运行任务，不需要 Gemini API Key。"
    )
    parser.add_argument("prompt", nargs="*", help="任务内容；使用 '-' 从标准输入读取")
    parser.add_argument("--workspace", default=os.getcwd(), help="工作区目录，默认当前目录")
    parser.add_argument("--model", choices=["flash_lite", "flash", "pro"], default="flash")
    parser.add_argument("--title", help="对话标题")
    parser.add_argument("--timeout", type=float, default=300, help="等待超时秒数")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--no-wait", action="store_true", help="只创建对话，不等待回复")
    parser.add_argument("--target", help="指定 app_data_dir，如 antigravity 或 antigravity-ide")
    parser.add_argument("--conversation", help="向已有会话继续发送消息（多轮）")
    parser.add_argument("--reuse", action="store_true", help="复用固定标题的会话，不新建（默认行为）")
    parser.add_argument("--new-session", action="store_true", help="强制新建会话")
    parser.add_argument("--quota", action="store_true", help="查询账户模型额度")
    parser.add_argument("--list", action="store_true", help="列出检测到的 Antigravity 实例")
    parser.add_argument("--debug", action="store_true", help="出错时打印完整堆栈")
    return parser


def main() -> int:
    _ensure_env()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = _build_parser()
    args = parser.parse_args()

    if args.list:
        for target in _processes():
            project = _find_project_id(Path(args.workspace).resolve())
            print(
                json.dumps(
                    {
                        "pid": target["pid"],
                        "app_data_dir": target["app_data_dir"],
                        "version": target["version"],
                        "ports": target["ports"],
                        "exe": target["exe"],
                        "project_id": project,
                    },
                    ensure_ascii=False,
                )
            )
        return 0

    if args.quota:
        try:
            target, _ = _pick_target(Path(args.workspace).expanduser().resolve(), args.target)
            quota = _quota(target)
        except Exception as exc:  # noqa: BLE001
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
            if args.debug:
                traceback.print_exc()
            return 1
        if args.json:
            print(json.dumps(quota, ensure_ascii=False))
        else:
            print(_format_quota(quota))
        return 0

    prompt = sys.stdin.read().strip() if args.prompt == ["-"] else " ".join(args.prompt).strip()
    if not prompt:
        parser.error("必须提供任务内容，或使用 '-' 从标准输入读取")

    workspace = Path(args.workspace).expanduser().resolve()
    if not workspace.is_dir():
        print(f"Workspace does not exist: {workspace}", file=sys.stderr)
        return 2

    try:
        target, project_id = _pick_target(workspace, args.target)
        env = _env_for(target, project_id)
        env["ANTIGRAVITY_LS_ADDRESS"] = f"127.0.0.1:{target['port']}"
        if not args.conversation and not args.new_session:
            existing = _find_conversation_by_title(args.title or REUSE_TITLE, target["app_data_dir"])
            if existing:
                args.conversation = existing
        if args.conversation:
            result = _send_message(target, env, args.conversation, prompt, args.timeout)
            if args.json:
                print(json.dumps(result, ensure_ascii=False))
            else:
                print(result["text"])
            return 0
        title = args.title or REUSE_TITLE
        command = [
            target["exe"],
            "agentapi",
            "new-conversation",
            f"--model={args.model}",
            f"--title={title}",
            prompt,
        ]
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env=env,
            **_hidden_kwargs(),
        )
        output = (proc.stdout or "").strip()
        if not output:
            raise RuntimeError((proc.stderr or "agentapi returned no output").strip())
        data = json.loads(output)
        if data.get("error"):
            raise RuntimeError(data["error"])
        new_conversation = (data.get("response") or {}).get("newConversation") or {}
        conversation_id = new_conversation.get("conversationId")
        if not conversation_id:
            raise RuntimeError(f"agentapi 未返回 conversationId: {output[:500]}")

        print(
            f"[antigravity] app={target['app_data_dir']} model={args.model} "
            f"conversation={conversation_id}",
            file=sys.stderr,
        )
        if args.no_wait:
            if args.json:
                print(json.dumps({"conversation_id": conversation_id}, ensure_ascii=False))
            else:
                print(conversation_id)
            return 0

        text = _wait_for_text(conversation_id, target["app_data_dir"], args.timeout)
        if args.json:
            print(
                json.dumps(
                    {
                        "conversation_id": conversation_id,
                        "app_data_dir": target["app_data_dir"],
                        "model": args.model,
                        "text": text,
                    },
                    ensure_ascii=False,
                )
            )
        else:
            print(text)
        return 0
    except TimeoutError as exc:
        print(str(exc), file=sys.stderr)
        return 124
    except Exception as exc:  # noqa: BLE001
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        if args.debug:
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
