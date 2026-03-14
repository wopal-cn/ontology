#!/usr/bin/env python3
"""
Firecrawl Extract Script
从单个或多个 URL 提取结构化数据
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests


def load_env():
    """从 Firecrawl 部署目录加载环境变量"""
    env_path = Path("/Users/sam/coding/good/firecrawl/.env")
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key, value)


def extract_single(
    url: str,
    schema: dict[str, Any] | None = None,
    prompt: str | None = None,
    api_base: str = "http://localhost:3002",
) -> dict[str, Any]:
    """
    从单个 URL 提取数据

    Args:
        url: 要提取的 URL
        schema: JSON Schema 定义提取的数据结构
        prompt: 自定义提示词
        api_base: Firecrawl API 基础 URL

    Returns:
        提取结果
    """
    endpoint = f"{api_base}/v1/extract"

    payload: dict[str, Any] = {"urls": [url]}

    if schema:
        payload["schema"] = schema

    if prompt:
        payload["prompt"] = prompt

    response = requests.post(endpoint, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()


def extract_batch(
    urls: list[str],
    schema: dict[str, Any] | None = None,
    prompt: str | None = None,
    api_base: str = "http://localhost:3002",
) -> dict[str, Any]:
    """
    从多个 URL 批量提取数据

    Args:
        urls: URL 列表
        schema: JSON Schema 定义提取的数据结构
        prompt: 自定义提示词
        api_base: Firecrawl API 基础 URL

    Returns:
        批量提取结果
    """
    endpoint = f"{api_base}/v1/extract"

    payload: dict[str, Any] = {"urls": urls}

    if schema:
        payload["schema"] = schema

    if prompt:
        payload["prompt"] = prompt

    response = requests.post(endpoint, json=payload, timeout=120)
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(description="Firecrawl URL 数据提取工具")
    parser.add_argument("urls", nargs="+", help="要提取的 URL(s)")
    parser.add_argument("--schema", type=str, help="JSON Schema 文件路径")
    parser.add_argument("--prompt", type=str, help="自定义提取提示词")
    parser.add_argument(
        "--api-base", default="http://localhost:3002", help="Firecrawl API 地址"
    )
    parser.add_argument("--output", "-o", type=str, help="输出文件路径")
    parser.add_argument("--pretty", action="store_true", help="美化 JSON 输出")

    args = parser.parse_args()

    load_env()

    schema = None
    if args.schema:
        with open(args.schema) as f:
            schema = json.load(f)

    try:
        if len(args.urls) == 1:
            result = extract_single(
                url=args.urls[0],
                schema=schema,
                prompt=args.prompt,
                api_base=args.api_base,
            )
        else:
            result = extract_batch(
                urls=args.urls,
                schema=schema,
                prompt=args.prompt,
                api_base=args.api_base,
            )

        indent = 2 if args.pretty else None
        output = json.dumps(result, indent=indent, ensure_ascii=False)

        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"✓ 结果已保存到 {args.output}")
        else:
            print(output)

    except requests.exceptions.RequestException as e:
        print(f"✗ 请求失败: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"✗ 错误: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
