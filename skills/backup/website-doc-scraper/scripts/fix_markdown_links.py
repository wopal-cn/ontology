#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import sys
import json
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional, Dict

class MarkdownLinkFixer:
    """修复 Markdown 链接：外链转内链、绝对路径转相对路径、添加后缀"""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.scraper_state = self._load_scraper_state()
        self.url_to_file_map = self._build_url_to_file_map()
        
    def _load_scraper_state(self) -> Optional[Dict]:
        """加载状态文件"""
        state_file = self.root_dir / ".scraper-state.json"
        if state_file.exists():
            try:
                return json.loads(state_file.read_text(encoding='utf-8'))
            except Exception:
                return None
        return None
    
    def _normalize_url_key(self, url: str) -> str:
        """规范化 URL 用于键值匹配（移除 fragment）"""
        try:
            parsed = urlparse(url)
            # 移除 fragment
            return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        except Exception:
            return url

    def _url_to_filename(self, url: str) -> str:
        """
        根据 URL 推导文件名（复用 state_manager 的逻辑简化版）
        注意：这里主要用于从 scraped_urls 推导本地路径
        """
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        
        if not path:
            return "index.md"
        
        if parsed.path.endswith('/'):
            return f"{path}/index.md"
            
        # 处理可能的 .md 后缀
        if path.endswith('.md'):
            return path
            
        return f"{path}.md"

    def _build_url_to_file_map(self) -> Dict[str, str]:
        """
        构建已抓取 URL 到本地文件路径的映射
        """
        if not self.scraper_state:
            return {}
        
        url_map = {}
        for url in self.scraper_state.get("scraped_urls", []):
            # 存入规范化的 URL
            normalized = self._normalize_url_key(url)
            # 计算对应的文件名（相对于 root_dir）
            # 注意：实际文件名可能因重名处理而不同，但在 scraper 逻辑中
            # URL 和 文件路径是确定的映射关系。如果 state_manager 支持自定义文件名
            # 这里可能需要更复杂的逻辑。目前假设标准映射。
            
            # 为了更准确，我们应该遍历文件系统或重新实现 state_manager 的完整逻辑
            # 但简单起见，且 state_manager 中的 save_batch_content 也是标准逻辑
            # 我们这里使用推定路径。
            
            # 更好的方法：如果我们能从 state 知道确切的文件路径最好
            # 但 state 目前只存了 URL。
            filename = self._url_to_filename(url)
            url_map[normalized] = filename
            
        return url_map

    def _compute_relative_path(self, source_file: Path, target_path_str: str) -> str:
        """计算相对路径"""
        source_relative = source_file.relative_to(self.root_dir)
        source_dir = source_relative.parent
        
        target_path = Path(target_path_str)
        
        # 如果源目录是根目录
        if str(source_dir) == '.':
            return target_path.as_posix()
            
        try:
            return target_path.relative_to(source_dir).as_posix()
        except ValueError:
            # 需要向上回溯
            up_levels = len(source_dir.parts)
            prefix = '../' * up_levels
            return f"{prefix}{target_path.as_posix()}"

    def _try_convert_external(self, url: str) -> Optional[str]:
        """
        尝试将外链转为内链
        返回: 目标文件路径（相对于根目录），或 None
        """
        if not self.url_to_file_map:
            return None
            
        normalized = self._normalize_url_key(url)
        return self.url_to_file_map.get(normalized)

    def _normalize_internal_link(self, link_url: str) -> Optional[str]:
        """
        规范化内链路径
        返回: 目标文件路径（相对于根目录），或 None 表示无需修改
        """
        # 移除锚点
        if '#' in link_url:
            file_part = link_url.split('#')[0]
        else:
            file_part = link_url
            
        if not file_part:
            return None
            
        # 1. 绝对路径 /docs/foo -> docs/foo.md
        if file_part.startswith('/'):
            clean_path = file_part.lstrip('/')
            if not clean_path:
                return 'index.md'
            
            if clean_path.endswith('/'):
                return f"{clean_path.rstrip('/')}/index.md"
            
            if clean_path.endswith('.md'):
                return clean_path
            
            return f"{clean_path}.md"
            
        # 2. 相对路径但缺少 .md 或以 / 结尾
        # 如果是 foo/ -> foo/index.md
        if file_part.endswith('/'):
             return f"{file_part.rstrip('/')}/index.md"
             
        # 如果没有 .md 且不像是一个已有的文件（不做太复杂判断，加上.md）
        if not file_part.endswith('.md'):
            return f"{file_part}.md"
            
        # 3. 已经有 .md 的相对路径，通常无需修改，返回 None 让上层保持原样
        # 除非我们要强制规范化
        return None

    def fix_file(self, file_path: Path) -> bool:
        """处理单个文件"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"✗ 无法读取 {file_path}: {e}")
            return False

        def replace_link(match: re.Match) -> str:
            full_match = match.group(0)
            link_text = match.group(1)
            link_url = match.group(2)
            
            # Step 1: 跳过纯锚点
            if link_url.startswith('#'):
                return full_match
            
            target_path = None
            anchor_suffix = ''
            
            # 分离锚点
            if '#' in link_url:
                url_without_anchor, anchor_part = link_url.split('#', 1)
                anchor_suffix = f'#{anchor_part}'
            else:
                url_without_anchor = link_url

            # Step 2: 处理外部链接
            if link_url.startswith(('http://', 'https://')):
                # 尝试外链转内链
                converted_path = self._try_convert_external(url_without_anchor)
                if converted_path:
                    target_path = converted_path
                else:
                    return full_match # 真正的外链，跳过
            elif link_url.startswith(('mailto:', 'data:', 'ftp://')):
                return full_match
            else:
                # Step 3: 处理内链
                # 先尝试规范化
                normalized = self._normalize_internal_link(url_without_anchor)
                
                if normalized:
                    target_path = normalized
                else:
                    # 如果返回 None，说明可能是已经规范的相对路径，或者我们需要特殊处理
                    # 复用原有逻辑：如果已经有 .md 且是相对路径，保持原样
                    # 但为了统一计算相对路径（应对可能的 ../ 问题），我们最好解析出 target_path
                    
                    # 简单处理：如果是相对路径且以.md结尾，我们假设它是相对于当前文件的
                    # 但为了确保正确性，我们最好构建出相对于根目录的路径再重新计算相对路径
                    # 不过这需要解析相对路径。
                    
                    # 兼容旧逻辑：如果 _normalize_internal_link 返回 None，
                    # 意味着 "不要动它，它看起来是相对路径且有后缀"
                    # 但旧逻辑其实会重新计算相对路径。
                    
                    # 让我们改进 _normalize_internal_link，让它总是返回目标路径（相对于根目录）
                    # 对于相对路径，我们需要结合 file_path 来计算相对于根目录的路径
                    
                    # 在这里处理相对路径解析比较复杂，因为需要知道当前文件的目录
                    # 让我们简化策略：
                    # 旧逻辑中：compute_relative_path 会处理 ../ 等
                    # 所以如果 _normalize_internal_link 返回 None，我们假设它是同级文件或正确的相对路径
                    return full_match

            # 计算最终的相对路径
            if target_path:
                try:
                    relative_path = self._compute_relative_path(file_path, target_path)
                    return f'[{link_text}]({relative_path}{anchor_suffix})'
                except Exception:
                    return full_match # 计算失败保持原样
            
            return full_match

        new_content = re.sub(r'\[([^\]]*?)\]\(([^)]+?)\)', replace_link, content, flags=re.MULTILINE)
        
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✓ {file_path.name}")
            return True
            
        return False

    def process_directory(self) -> tuple[int, int]:
        """处理整个目录"""
        processed = 0
        modified = 0
        for md_file in sorted(self.root_dir.rglob('*.md')):
            processed += 1
            if self.fix_file(md_file):
                modified += 1
        return processed, modified


def main():
    if len(sys.argv) < 2:
        print('用法: python fix_markdown_links.py <目录>')
        sys.exit(1)
    
    target_dir = Path(sys.argv[1])
    if not target_dir.exists():
        print(f'错误: 目录不存在: {target_dir}')
        sys.exit(1)
        
    print(f'开始处理目录: {target_dir}')
    print('-' * 50)
    
    fixer = MarkdownLinkFixer(target_dir)
    processed, modified = fixer.process_directory()
    
    print('-' * 50)
    print(f'处理完成: 共 {processed} 个文件，修改了 {modified} 个文件')

if __name__ == '__main__':
    main()
