#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导出服务友好错误目录。"""

from __future__ import annotations

from typing import Any, Dict, List


def _entry(
    *,
    title: str,
    message: str,
    actions: List[str],
    severity: str = "error",
    retryable: bool = False,
) -> Dict[str, Any]:
    return {
        "title": title,
        "message": message,
        "actions": actions,
        "severity": severity,
        "retryable": retryable,
    }


CATALOG: Dict[str, Dict[str, Any]] = {
    "EXPORT_NO_CONNECTION": _entry(
        title="未连接到 Pro Tools",
        message="导出前需要先建立与 Pro Tools 的连接。",
        actions=["检查 Pro Tools 是否已启动", "点击刷新连接状态", "重试导出"],
        severity="warn",
        retryable=True,
    ),
    "EXPORT_INVALID_REQUEST": _entry(
        title="导出参数不完整",
        message="当前导出请求缺少必要信息，请检查后重试。",
        actions=["确认已选择快照", "确认输出目录与混音源名称已填写", "重试导出"],
        severity="warn",
        retryable=True,
    ),
    "EXPORT_TASK_FAILED": _entry(
        title="导出任务失败",
        message="导出过程中出现错误，部分文件可能未成功生成。",
        actions=["检查失败快照和输出路径", "确认磁盘可写", "重试失败项或导出日志"],
        severity="error",
        retryable=True,
    ),
}


def build_friendly_error(error_code: str, message: str, details: Dict[str, Any] | None = None) -> Dict[str, Any]:
    friendly = CATALOG.get(
        error_code,
        _entry(
            title="发生未知错误",
            message="请重试；若持续失败，请导出日志并联系支持。",
            actions=["重试当前操作", "导出日志", "联系支持并附上错误码"],
            severity="error",
            retryable=True,
        ),
    )

    payload: Dict[str, Any] = {
        "success": False,
        "error_code": error_code,
        "message": message,
        "friendly": friendly,
    }
    if details is not None:
        payload["details"] = details
    return payload
