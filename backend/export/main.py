#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PT-STEM Backend Server
基于 FastAPI 和 py-ptsl 的 Pro Tools 控制后端服务
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from dotenv import load_dotenv

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from api.routes import router as api_router
from api.error_catalog import build_friendly_error
from core.ptsl_client import PTSLClient
from core.config import settings

# 加载环境变量
load_dotenv()

LOG_RETENTION_DAYS = 7
LOG_MAX_TOTAL_BYTES = 50 * 1024 * 1024


def _cleanup_log_files(logs_dir: Path) -> None:
    """Apply retention policy: 7 days and <= 50MB total."""

    if not logs_dir.exists():
        return

    now = datetime.utcnow()
    files = [p for p in logs_dir.glob("*.log*") if p.is_file()]
    for file_path in files:
        try:
            mtime = datetime.utcfromtimestamp(file_path.stat().st_mtime)
            if now - mtime > timedelta(days=LOG_RETENTION_DAYS):
                file_path.unlink(missing_ok=True)
        except OSError:
            continue

    files = [p for p in logs_dir.glob("*.log*") if p.is_file()]
    files.sort(key=lambda path: path.stat().st_mtime)
    total_size = sum(path.stat().st_size for path in files)
    for file_path in files:
        if total_size <= LOG_MAX_TOTAL_BYTES:
            break
        try:
            file_size = file_path.stat().st_size
            file_path.unlink(missing_ok=True)
            total_size -= file_size
        except OSError:
            continue


# 配置日志
logs_dir = project_root / "logs"
logs_dir.mkdir(parents=True, exist_ok=True)
_cleanup_log_files(logs_dir)

logger.remove()
logger.add(sys.stdout, level="INFO", serialize=True)
logger.add(
    str(logs_dir / "app.log"),
    rotation="10 MB",
    retention=5,
    level="INFO",
    serialize=True,
)

# 全局 PTSL 客户端实例
ptsl_client: PTSLClient = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global ptsl_client
    
    # 启动时初始化
    logger.info("正在启动 PT-STEM Backend Server...")
    
    try:
        # 初始化 PTSL 客户端
        ptsl_client = PTSLClient(
            host=settings.PTSL_HOST,
            port=settings.PTSL_PORT
        )
        
        # 尝试连接到 Pro Tools
        connection_success = await ptsl_client.connect()
        if connection_success:
            logger.info(f"已连接到 Pro Tools (PTSL): {settings.PTSL_HOST}:{settings.PTSL_PORT}")
        else:
            logger.warning(f"无法连接到 Pro Tools (PTSL): {settings.PTSL_HOST}:{settings.PTSL_PORT}，应用将以离线模式运行")
        
        # 将客户端实例添加到应用状态
        app.state.ptsl_client = ptsl_client

    except Exception as e:
        logger.error(f"初始化 PTSL 客户端失败: {e}")
        # 不阻止应用启动，允许在运行时重新连接
        app.state.ptsl_client = None
    
    logger.info("PT-STEM Backend Server 启动完成")
    
    yield
    
    # 关闭时清理
    logger.info("正在关闭 PT-STEM Backend Server...")
    
    if ptsl_client:
        try:
            await ptsl_client.disconnect()
            logger.info("已断开 PTSL 连接")
        except Exception as e:
            logger.error(f"断开 PTSL 连接时出错: {e}")

    logger.info("PT-STEM Backend Server 已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="PT-STEM Backend API",
    description="Pro Tools STEM 分离和音频处理后端服务",
    version="0.1.1",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """根路径健康检查"""
    return {
        "message": "PT-STEM Backend Server",
        "version": "0.1.1",
        "status": "running",
        "ptsl_connected": app.state.ptsl_client is not None and app.state.ptsl_client.is_connected
    }


@app.get("/health")
async def health_check():
    """健康检查端点"""
    ptsl_status = "disconnected"
    
    if app.state.ptsl_client:
        try:
            ptsl_status = "connected" if app.state.ptsl_client.is_connected else "disconnected"
        except Exception:
            ptsl_status = "error"
    
    return {
        "status": "healthy",
        "ptsl_status": ptsl_status,
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """HTTP 异常统一转为友好错误结构。"""
    _ = request
    detail = exc.detail
    if isinstance(detail, dict):
        error_code = str(detail.get("error_code") or detail.get("code") or "EXPORT_HTTP_ERROR")
        message = str(detail.get("message") or "请求失败")
        extra = {k: v for k, v in detail.items() if k not in {"error_code", "code", "message"}}
        return JSONResponse(
            status_code=exc.status_code,
            content=build_friendly_error(error_code, message, details=(extra or None)),
        )

    message = str(detail)
    if exc.status_code == 400:
        code = "EXPORT_INVALID_REQUEST"
    elif exc.status_code == 503:
        code = "EXPORT_NO_CONNECTION"
    else:
        code = "EXPORT_HTTP_ERROR"
    return JSONResponse(
        status_code=exc.status_code,
        content=build_friendly_error(code, message),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理器"""
    logger.error(f"未处理的异常: {exc}")
    return JSONResponse(
        status_code=500,
        content=build_friendly_error(
            "UNEXPECTED_ERROR",
            "服务器内部错误，请稍后重试",
            details={"exception": str(exc)},
        ),
    )


if __name__ == "__main__":
    import uvicorn
    
    # 确保日志目录存在
    os.makedirs("logs", exist_ok=True)
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
