#!/usr/bin/env python3
"""
Firecrawl Crawl Script
爬取整个网站并提取内容
"""

import argparse
import json
import os
import sys
import time
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


def start_crawl(
    url: str,
    max_depth: int = 2,
    max_breadth: int = 20,
    limit: int = 50,
    include_paths: list[str] | None = None,
    exclude_paths: list[str] | None = None,
    formats: list[str] | None = None,
    api_base: str = "http://localhost:3002",
) -> dict[str, Any]:
    """
    启动爬取任务

    Args:
        url: 起始 URL
        max_depth: 最大爬取深度
        max_breadth: 每层最大链接数
        limit: 总页面限制
        include_paths: 包含的路径正则模式
        exclude_paths: 排除的路径正则模式
        formats: 输出格式列表 (markdown, html, rawHtml, links, screenshot)
        api_base: Firecrawl API 基础 URL

    Returns:
        任务信息 {"id": "job-id", "url": "status-url"}
    """
    endpoint = f"{api_base}/v2/crawl"

    payload: dict[str, Any] = {"url": url}

    if formats:
        payload["scrapeOptions"] = {"formats": formats}

    response = requests.post(endpoint, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()


def wait_for_crawl(
    job_id: str,
    api_base: str = "http://localhost:3002",
    poll_interval: int = 2,
    max_wait: int = 300,
) -> dict[str, Any]:
    """
    等待爬取任务完成并获取结果

    Args:
        job_id: 任务 ID
        api_base: Firecrawl API 基础 URL
        poll_interval: 轮询间隔（秒）
        max_wait: 最大等待时间（秒）

    Returns:
        爬取结果
    """
    endpoint = f"{api_base}/v2/crawl/{job_id}"
    start_time = time.time()

    while True:
        response = requests.get(endpoint, timeout=30)
        response.raise_for_status()
        result = response.json()

        status = result.get("status")
        if status == "completed":
            return result
        elif status == "failed":
            raise Exception(f"Crawl job failed: {result.get('error', 'Unknown error')}")

        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise TimeoutError(f"Crawl job did not complete within {max_wait} seconds")

        print(
            f"⏳ 爬取进行中... 已完成 {result.get('completed', 0)}/{result.get('total', '?')} 页",
            end="\r",
        )
        time.sleep(poll_interval)


def crawl(
    url: str,
    max_depth: int = 2,
    max_breadth: int = 20,
    limit: int = 50,
    include_paths: list[str] | None = None,
    exclude_paths: list[str] | None = None,
    formats: list[str] | None = None,
    api_base: str = "http://localhost:3002",
    poll_interval: int = 2,
    max_wait: int = 300,
) -> dict[str, Any]:
    """
    爬取网站（同步等待完成）

    Args:
        url: 起始 URL
        max_depth: 最大爬取深度（注意：v2 API 可能不支持此参数）
        max_breadth: 每层最大链接数（注意：v2 API 可能不支持此参数）
        limit: 总页面限制（注意：v2 API 可能不支持此参数）
        include_paths: 包含的路径正则模式（注意：v2 API 可能不支持此参数）
        exclude_paths: 排除的路径正则模式（注意：v2 API 可能不支持此参数）
        formats: 输出格式列表
        api_base: Firecrawl API 基础 URL
        poll_interval: 轮询间隔（秒）
        max_wait: 最大等待时间（秒）

    Returns:
        爬取结果
    """
    print(f"🚀 启动爬取任务: {url}")
    job_info = start_crawl(
        url=url,
        max_depth=max_depth,
        max_breadth=max_breadth,
        limit=limit,
        include_paths=include_paths,
        exclude_paths=exclude_paths,
        formats=formats,
        api_base=api_base,
    )

    job_id = job_info["id"]
    print(f"📋 任务 ID: {job_id}")

    result = wait_for_crawl(
        job_id=job_id, api_base=api_base, poll_interval=poll_interval, max_wait=max_wait
    )

    print(f"\n✓ 爬取完成！共 {len(result.get('data', []))} 页")
    return result


def main():
    parser = argparse.ArgumentParser(description="Firecrawl 网站爬取工具")
    parser.add_argument("url", help="起始 URL")
    parser.add_argument("--max-depth", type=int, default=2, help="最大爬取深度")
    parser.add_argument("--max-breadth", type=int, default=20, help="每层最大链接数")
    parser.add_argument("--limit", type=int, default=50, help="总页面限制")
    parser.add_argument("--include-paths", nargs="*", help="包含的路径正则模式")
    parser.add_argument("--exclude-paths", nargs="*", help="排除的路径正则模式")
    parser.add_argument(
        "--formats",
        nargs="*",
        default=["markdown"],
        help="输出格式 (markdown, html, rawHtml)",
    )
    parser.add_argument(
        "--api-base", default="http://localhost:3002", help="Firecrawl API 地址"
    )
    parser.add_argument("--output", "-o", type=str, help="输出文件路径")
    parser.add_argument("--pretty", action="store_true", help="美化 JSON 输出")

    args = parser.parse_args()

    load_env()

    try:
        result = crawl(
            url=args.url,
            max_depth=args.max_depth,
            max_breadth=args.max_breadth,
            limit=args.limit,
            include_paths=args.include_paths,
            exclude_paths=args.exclude_paths,
            formats=args.formats,
            api_base=args.api_base,
        )

        indent = 2 if args.pretty else None
        output = json.dumps(result, indent=indent, ensure_ascii=False)

        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"✓ 爬取完成，结果已保存到 {args.output}")
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
