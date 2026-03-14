#!/usr/bin/env python3
"""
Firecrawl Status Check Script
检查 Firecrawl 服务状态和配置
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests


def check_health(api_base: str = "http://localhost:3002") -> dict:
    """
    检查 Firecrawl 服务健康状态

    Args:
        api_base: Firecrawl API 基础 URL

    Returns:
        健康状态信息
    """
    try:
        response = requests.get(f"{api_base}/", timeout=5)
        response.raise_for_status()
        data = response.json()
        return {
            "status": "healthy",
            "code": response.status_code,
            "message": data.get("message", "OK"),
        }
    except requests.exceptions.RequestException as e:
        return {"status": "unhealthy", "error": str(e)}


def check_env_config() -> dict:
    """
    检查环境变量配置

    Returns:
        配置信息
    """
    env_path = Path("/Users/sam/coding/good/firecrawl/.env")

    config: dict[str, Any] = {"env_file_exists": env_path.exists()}

    if env_path.exists():
        env_vars: dict[str, str] = {}
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _ = line.split("=", 1)
                    # 隐藏敏感信息
                    if "API_KEY" in key or "SECRET" in key:
                        env_vars[key] = "***"
                    else:
                        env_vars[key] = "configured"

        config["env_vars"] = env_vars

    return config


def main():
    parser = argparse.ArgumentParser(description="Firecrawl 状态检查工具")
    parser.add_argument(
        "--api-base", default="http://localhost:3002", help="Firecrawl API 地址"
    )
    parser.add_argument("--json", action="store_true", help="以 JSON 格式输出")

    args = parser.parse_args()

    health = check_health(args.api_base)
    config = check_env_config()

    status = {
        "service": health,
        "config": config,
        "api_base": args.api_base,
    }

    if args.json:
        print(json.dumps(status, indent=2))
    else:
        print("=" * 50)
        print("Firecrawl 状态检查")
        print("=" * 50)

        print(f"\n服务状态: {health['status'].upper()}")
        if health["status"] == "healthy":
            print(f"✓ API 地址: {args.api_base}")
            print(f"✓ 响应码: {health['code']}")
        else:
            print(f"✗ 错误: {health.get('error', 'Unknown')}")

        print(f"\n配置文件: {'✓ 存在' if config['env_file_exists'] else '✗ 不存在'}")
        if "env_vars" in config:
            print("已配置的环境变量:")
            for key, value in config["env_vars"].items():
                print(f"  - {key}: {value}")

        print("=" * 50)

        if health["status"] != "healthy":
            sys.exit(1)


if __name__ == "__main__":
    main()
