"""Friendly error catalog for import-side API responses."""

from __future__ import annotations

from typing import Any


def _entry(
    *,
    title: str,
    message: str,
    actions: list[str],
    severity: str = "error",
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "title": title,
        "message": message,
        "actions": actions,
        "severity": severity,
        "retryable": retryable,
    }


_CATALOG: dict[str, dict[str, Any]] = {
    "NO_ITEMS": _entry(
        title="没有可执行的项目",
        message="当前列表为空，请先添加音频文件后再开始。",
        actions=["点击添加文件夹", "确认已扫描到 WAV/AIFF 文件", "重新开始自动化"],
        severity="warn",
        retryable=True,
    ),
    "NO_OPEN_SESSION": _entry(
        title="未检测到已打开工程",
        message="请先在 Pro Tools 打开会话工程，再重试当前操作。",
        actions=["切回 Pro Tools 打开工程", "确认工程加载完成", "返回 Presto 重试"],
        severity="warn",
        retryable=True,
    ),
    "NO_TRACK_SELECTED": _entry(
        title="未检测到已选中的轨道",
        message="请先在 Pro Tools 选中至少一条轨道，再继续。",
        actions=["切回 Pro Tools 选择轨道", "确认轨道可编辑", "返回 Presto 重试"],
        severity="warn",
        retryable=True,
    ),
    "PT_VERSION_UNKNOWN": _entry(
        title="无法识别 Pro Tools 版本",
        message="当前环境无法检测版本，功能可能受限。",
        actions=["确认 Pro Tools 正常运行", "尝试重启 Presto", "如持续失败请导出日志反馈"],
        severity="warn",
        retryable=True,
    ),
    "PT_VERSION_UNSUPPORTED": _entry(
        title="Pro Tools 版本不受支持",
        message="当前版本低于所需最低版本，请升级后再试。",
        actions=["升级 Pro Tools", "重启 Pro Tools 与 Presto", "重新执行当前流程"],
        severity="error",
        retryable=False,
    ),
    "TRACK_DETECTION_FAILED": _entry(
        title="轨道识别失败",
        message="导入后轨道数量与预期不一致，部分文件可能未正确导入。",
        actions=["检查失败文件格式与采样率", "重试导入失败文件", "导出日志并反馈问题"],
        severity="error",
        retryable=True,
    ),
    "IMPORT_FAILED": _entry(
        title="导入失败",
        message="Pro Tools 未完成导入，请检查音频文件与工程状态。",
        actions=["确认文件可读且格式受支持", "检查工程磁盘权限", "重试当前导入"],
        severity="error",
        retryable=True,
    ),
    "UI_ACTION_FAILED": _entry(
        title="自动化操作失败",
        message="界面自动化步骤未完成，可能是焦点或窗口状态变化导致。",
        actions=["确认 Pro Tools 在前台", "确认目标窗口已打开", "重试当前步骤"],
        severity="error",
        retryable=True,
    ),
    "PTSL_CONNECT_FAILED": _entry(
        title="无法连接 Pro Tools",
        message="Presto 未能连接到 Pro Tools 服务。",
        actions=["确认 Pro Tools 已启动", "检查本机端口占用", "重启 Presto 后重试"],
        severity="error",
        retryable=True,
    ),
}


def build_friendly_error(error_code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build standard error payload with user-facing friendly block."""

    friendly = _CATALOG.get(
        error_code,
        _entry(
            title="发生未知错误",
            message="请重试；若持续失败，请导出日志并联系支持。",
            actions=["重试当前操作", "导出日志", "联系支持并附上错误码"],
            severity="error",
            retryable=True,
        ),
    )

    payload: dict[str, Any] = {
        "success": False,
        "error_code": error_code,
        "message": message,
        "friendly": friendly,
    }
    if details is not None:
        payload["details"] = details
    return payload
