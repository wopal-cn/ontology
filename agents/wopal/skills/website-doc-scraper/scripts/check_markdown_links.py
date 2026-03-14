#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import Counter
from urllib.parse import urlparse

class MarkdownLinkChecker:
    """检查标准 Markdown 链接的有效性和规范性"""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.all_files = self._get_all_markdown_files()
        # 加载状态文件获取抓取配置
        self.scraper_state = self._load_scraper_state()
        # 构建已抓取 URL 集合用于快速查找
        self.scraped_urls = set()
        if self.scraper_state:
            self.scraped_urls = set(self.scraper_state.get("scraped_urls", []))
        
    def _get_all_markdown_files(self) -> Dict[str, Path]:
        """获取所有 Markdown 文件，映射相对路径到绝对路径"""
        files = {}
        for file_path in self.root_dir.rglob('*.md'):
            relative_path = file_path.relative_to(self.root_dir).as_posix()
            files[relative_path] = file_path
        return files
    
    def _load_scraper_state(self) -> Optional[Dict]:
        """加载 .scraper-state.json 获取域名和路径规则"""
        state_file = self.root_dir / ".scraper-state.json"
        if state_file.exists():
            try:
                return json.loads(state_file.read_text(encoding='utf-8'))
            except Exception:
                return None
        return None
    
    def check_scraping_complete(self) -> Tuple[bool, List[str]]:
        """
        检查抓取是否完成
        
        返回: (is_complete, pending_urls)
        """
        if not self.scraper_state:
            return True, []  # 无状态文件，跳过检查
        
        pending = self.scraper_state.get("pending_urls", [])
        return len(pending) == 0, pending
    
    def _normalize_url(self, url: str) -> str:
        """规范化 URL：移除锚点、尾部斜杠、.md 扩展名"""
        try:
            parsed = urlparse(url)
            # 移除锚点
            parsed = parsed._replace(fragment='')
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            # 移除尾部斜杠
            if clean_url.endswith('/') and len(parsed.path) > 1:
                clean_url = clean_url.rstrip('/')
            # 移除 .md 扩展名
            if clean_url.endswith('.md'):
                clean_url = clean_url[:-3]
            return clean_url
        except Exception:
            return url
    
    def _is_external_in_scope(self, url: str) -> Tuple[bool, bool]:
        """
        判断外链是否在抓取范围内
        
        返回: (in_scope, is_scraped)
        """
        if not self.scraper_state:
            return False, False
        
        parsed = urlparse(url)
        domain = self.scraper_state.get("domain")
        path_filter = self.scraper_state.get("path_filter")
        
        # 检查域名
        if parsed.netloc != domain:
            return False, False
        
        # 检查路径规则
        if path_filter and not re.match(path_filter, parsed.path):
            return False, False
        
        # 规范化 URL 并检查是否已抓取
        normalized = self._normalize_url(url)
        return True, normalized in self.scraped_urls
    
    def _url_to_target_path(self, url: str) -> str:
        """将 URL 转换为相对于根目录的目标文件路径"""
        parsed = urlparse(url)
        path = parsed.path.rstrip('/')
        
        if not path or path == '/':
            return 'index.md'
        
        clean_path = path.lstrip('/')
        return f'{clean_path}.md'
    
    def _is_in_code_block(self, content: str, position: int) -> bool:
        """
        检查位置是否在代码块中
        支持 ``` 代码块和缩进代码块
        """
        lines = content[:position].split('\n')
        
        # 检查是否在 ``` 代码块中
        in_code_block = False
        for line in lines:
            if line.strip().startswith('```'):
                in_code_block = not in_code_block
        
        if in_code_block:
            return True
        
        # 检查是否在缩进代码块中（4个空格或1个tab）
        current_line = lines[-1] if lines else ''
        if current_line.startswith('    ') or current_line.startswith('\t'):
            return True
        
        return False
    
    def _check_link_format(self, link_url: str) -> Tuple[bool, Optional[str]]:
        """
        检查链接格式是否正确
        
        返回: (是否格式正确, 错误原因)
        """
        # 检查是否为空
        if not link_url or link_url.strip() == '':
            return False, "空链接URL"
        
        # 检查特殊字符（空格需要编码）
        if ' ' in link_url and not (link_url.startswith('http://') or link_url.startswith('https://')):
            return False, "链接包含未编码的空格"
        
        # 检查括号匹配
        open_parens = link_url.count('(')
        close_parens = link_url.count(')')
        if open_parens != close_parens:
            return False, "括号不匹配"
        
        return True, None
    
    def extract_links_from_file(self, file_path: Path) -> Tuple[List[Tuple[str, str, int]], List[Tuple[str, str, int, str]]]:
        """
        从文件中提取所有标准 Markdown 链接
        排除代码块中的内容
        
        返回: (links, syntax_errors)
        - links: [(link_text, link_url, line_num)]
        - syntax_errors: [(link_text, link_url, line_num, reason)]
        """
        links = []
        syntax_errors = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.splitlines()
                
            current_position = 0
            
            for line_num, line in enumerate(lines, 1):
                line_length = len(line) + 1  # +1 for newline
                line_start_pos = current_position
                line_end_pos = current_position + line_length
                
                # 检查这行是否在代码块中
                is_in_code = self._is_in_code_block(content, line_start_pos)
                
                if not is_in_code:
                    # 检查不完整的链接（语法错误）
                    # 匹配 [text]( 但没有闭合的 )
                    incomplete_matches = re.finditer(r'\[([^\]]*?)\]\(([^)]*)', line)
                    for match in incomplete_matches:
                        # 检查是否在同一行有闭合的 )
                        match_end = match.end()
                        rest_of_line = line[match_end:]
                        if ')' not in rest_of_line:
                            match_pos = line_start_pos + match.start()
                            if not self._is_in_code_block(content, match_pos):
                                syntax_errors.append((match.group(1), match.group(2), line_num, "不完整的链接语法"))
                    
                    # 匹配完整的标准 Markdown 链接 [text](url)
                    matches = re.finditer(r'\[([^\]]*?)\]\(([^)]+)\)', line)
                    for match in matches:
                        # 检查链接本身是否在代码块中
                        match_pos = line_start_pos + match.start()
                        if not self._is_in_code_block(content, match_pos):
                            links.append((match.group(1), match.group(2), line_num))
                
                current_position = line_end_pos
        except Exception as e:
            print(f'错误: 读取文件失败 {file_path}: {e}')
        
        return links, syntax_errors
    
    def _resolve_relative_path(self, link_url: str, source_dir: Path) -> Path:
        """
        解析相对路径为相对于根目录的绝对路径
        
        参数:
            link_url: 链接URL
            source_dir: 源文件相对于根目录的目录（如 concepts、cli 等）
        
        返回:
            解析后的路径对象（相对于根目录）
        """
        # 移除锚点
        if '#' in link_url:
            file_part = link_url.split('#')[0]
        else:
            file_part = link_url
        
        # 处理绝对路径（以 / 开头）
        if file_part.startswith('/'):
            # 移除开头的 /
            clean_url = file_part.lstrip('/')
            return Path(clean_url)
        
        # 处理相对路径
        if not file_part:
            # 空路径，返回 index.md
            return Path('index.md')
        
        # 将源目录转换为 Path 对象（已经是相对路径）
        dir_parts = list(source_dir.parts) if source_dir.parts else []
        
        # 解析链接路径的各个部分
        link_parts = []
        for part in Path(file_part).parts:
            if part == '..':
                # 回退一级
                if dir_parts:
                    dir_parts.pop()
            elif part == '.':
                # 当前目录，忽略
                continue
            else:
                link_parts.append(part)
        
        # 合并目录和链接路径
        final_parts = dir_parts + link_parts
        
        if not final_parts:
            return Path('index.md')
        
        return Path(*final_parts)
    
    def _classify_link(self, link_text: str, link_url: str, source_file: Path) -> Dict:
        """
        对链接进行分类
        
        返回分类信息字典
        """
        # 获取源文件相对于根目录的路径
        source_relative = source_file.relative_to(self.root_dir)
        source_dir = source_relative.parent
        
        result = {
            'classification': 'unknown',
            'target_file': None,
            'reason': None,
            'is_external': False,
        }
        
        # 检查格式错误
        is_valid_format, format_error = self._check_link_format(link_url)
        if not is_valid_format:
            result['classification'] = 'format_error'
            result['reason'] = format_error
            return result
        
        # 检查是否为外部链接
        if link_url.startswith(('http://', 'https://')):
            result['is_external'] = True
            
            # 检查是否在抓取范围内
            in_scope, is_scraped = self._is_external_in_scope(link_url)
            
            if in_scope:
                if is_scraped:
                    result['classification'] = 'external_convertible'
                    result['reason'] = "外链可转内链（已抓取）"
                    result['target_file'] = self._url_to_target_path(link_url)
                else:
                    result['classification'] = 'external_missing'
                    result['reason'] = "外链在范围内但未抓取（遗漏）"
            else:
                result['classification'] = 'valid'
                result['reason'] = "外部链接"
            return result
        
        # 检查其他外部协议
        if link_url.startswith(('mailto:', 'data:', 'ftp://')):
            result['classification'] = 'valid'
            result['is_external'] = True
            result['reason'] = "外部链接"
            return result
        
        # 检查是否为纯锚点链接（以 # 开头）
        if link_url.startswith('#'):
            result['classification'] = 'valid'
            result['is_external'] = True
            result['reason'] = "锚点链接"
            return result
        
        # 检查是否为绝对路径（以 / 开头）
        is_absolute_path = link_url.startswith('/')
        
        # 解析路径以确定目标文件
        if '#' in link_url:
            file_part, anchor_part = link_url.split('#', 1)
        else:
            file_part = link_url
        
        # 移除开头的 /
        clean_url = file_part.lstrip('/')
        
        # 检查是否以 / 结尾（目录URL）
        is_dir = file_part.endswith('/')
        
        # 确定目标文件路径
        if not clean_url:
            # 根路径 /
            target_path = 'index.md'
        elif is_dir:
            # /install/ -> install/index.md
            slash_removed = clean_url.rstrip('/')
            target_path = f"{slash_removed}/index.md"
        else:
            target_path = clean_url
        
        # 检查是否有 .md 扩展名
        has_md_extension = target_path.endswith('.md')
        
        if not has_md_extension:
            target_path = f"{target_path}.md"
        
        result['target_file'] = target_path
        
        # 分类逻辑
        if is_absolute_path:
            # 绝对路径链接
            result['reason'] = "绝对路径链接"
            
            # 继续检查是否缺少.md
            if not has_md_extension:
                result['classification'] = 'absolute_path_non_standard'
                result['reason'] = "绝对路径 + 缺少.md"
            else:
                result['classification'] = 'absolute_path'
            
            # 检查文件是否存在
            if target_path in self.all_files:
                return result
            else:
                # 绝对路径 + 文件不存在
                result['classification'] = 'absolute_path_missing_file'
                result['reason'] = "绝对路径 + 缺少文件或网站错链"
                return result
        
        
        # 移除锚点
        if '#' in link_url:
            file_part, anchor_part = link_url.split('#', 1)
        else:
            file_part = link_url
        
        # 检查是否以 / 结尾（目录URL）
        is_dir = file_part.endswith('/')
        
        # 解析路径
        resolved_path = self._resolve_relative_path(file_part, source_dir)
        
        # 处理目录URL
        if is_dir:
            resolved_path = resolved_path / 'index'
        
        # 检查是否有 .md 扩展名
        has_md_extension = str(resolved_path).endswith('.md')
        
        # 确定目标文件路径
        if not has_md_extension:
            # 添加 .md 扩展名
            target_path = f"{resolved_path}.md"
        else:
            target_path = str(resolved_path)
        
        # 转换为相对于根目录的路径字符串
        target_path = target_path.replace('\\', '/')
        result['target_file'] = target_path
        
        # 检查是否缺少 .md 扩展名（不规范链接）
        if not has_md_extension:
            result['classification'] = 'non_standard'
            result['reason'] = "缺少.md扩展名"
            
            # 进一步检查文件是否存在
            if target_path in self.all_files:
                return result
            else:
                # 不规范且文件不存在 -> 缺少文件
                result['classification'] = 'missing_file'
                result['reason'] = "缺少文件"
                return result
        
        # 检查文件是否存在（有.md扩展名的情况）
        if target_path in self.all_files:
            result['classification'] = 'valid'
            result['reason'] = "有效链接"
        else:
            result['classification'] = 'missing_file'
            result['reason'] = "缺少文件"
        
        return result
    
    def check_all_links(self) -> Dict:
        """检查所有文件中的所有 Markdown 链接"""
        results = {
            'total_files': len(self.all_files),
            'total_links': 0,
            'valid_links': 0,
            'absolute_path_non_standard': 0,  # 绝对路径 + 缺少.md
            'absolute_path_links': 0,  # 绝对路径（有.md）
            'absolute_path_missing_file': 0,  # 绝对路径 + 缺少文件
            'non_standard_links': 0,  # 相对路径 + 缺少.md
            'missing_file_links': 0,  # 相对路径 + 缺少文件
            'format_error_links': 0,  # 格式错误
            'external_convertible_links': 0,  # 外链可转内链
            'external_missing_links': 0,  # 范围内的缺漏外链
            'syntax_errors': [],  # 语法错误列表
            'files_with_issues': set(),  # 有问题的文件
            'link_types': Counter(),  # 链接类型统计
            'absolute_path_non_standard_detail': [],  # 绝对路径 + 缺少.md 详情
            'absolute_path_detail': [],  # 绝对路径详情
            'absolute_path_missing_detail': [],  # 绝对路径 + 缺少文件详情
            'non_standard_detail': [],  # 相对路径 + 缺少.md 详情
            'missing_file_detail': [],  # 相对路径 + 缺少文件详情
            'format_error_detail': [],  # 格式错误详情
            'external_convertible_detail': [],  # 可转内链详情
            'external_missing_detail': [],  # 缺漏外链详情

        }
        
        for file_path in self.all_files.values():
            file_relative = file_path.relative_to(self.root_dir).as_posix()
            links, syntax_errors = self.extract_links_from_file(file_path)
            
            # 记录语法错误
            for link_text, link_url, line_num, reason in syntax_errors:
                results['syntax_errors'].append({
                    'source_file': file_relative,
                    'line': line_num,
                    'link_text': link_text,
                    'link_url': link_url,
                    'reason': reason,
                })
                results['format_error_links'] += 1
                results['files_with_issues'].add(file_relative)
            
            # 检查每个链接
            for link_text, link_url, line_num in links:
                results['total_links'] += 1
                
                # 分类链接
                classification = self._classify_link(link_text, link_url, file_path)
                
                # 统计链接类型
                if link_url.startswith(('http://', 'https://')):
                    results['link_types']['外部链接'] += 1
                elif link_url.startswith('mailto:'):
                    results['link_types']['邮件链接'] += 1
                elif link_url.startswith('#'):
                    results['link_types']['锚点链接'] += 1
                else:
                    results['link_types']['内部链接'] += 1
                
                # 根据分类更新统计
                if classification['classification'] == 'valid':
                    results['valid_links'] += 1
                elif classification['classification'] == 'absolute_path_non_standard':
                    results['absolute_path_non_standard'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['absolute_path_non_standard_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification['target_file'],
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'absolute_path':
                    results['absolute_path_links'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['absolute_path_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification['target_file'],
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'absolute_path_missing_file':
                    results['absolute_path_missing_file'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['absolute_path_missing_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification['target_file'],
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'non_standard':
                    results['non_standard_links'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['non_standard_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification['target_file'],
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'missing_file':
                    results['missing_file_links'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['missing_file_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification['target_file'],
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'format_error':
                    results['format_error_links'] += 1
                    results['files_with_issues'].add(file_relative)
                    results['format_error_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'external_convertible':
                    results['external_convertible_links'] += 1
                    results['external_convertible_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'target_file': classification.get('target_file'),
                        'reason': classification['reason'],
                    })
                elif classification['classification'] == 'external_missing':
                    results['external_missing_links'] += 1
                    results['files_with_issues'].add(file_relative)  # 标记为有问题，因为这是遗漏
                    results['external_missing_detail'].append({
                        'source_file': file_relative,
                        'line': line_num,
                        'link_text': link_text,
                        'link_url': link_url,
                        'reason': classification['reason'],
                    })
        
        results['files_with_issues'] = list(results['files_with_issues'])
        
        return results
    
    def generate_report(self, results: Dict) -> str:
        """生成简化的分析报告"""
        report_lines = []
        
        # 总体统计
        report_lines.append("总体统计")
        report_lines.append("-" * 40)
        report_lines.append(f"总文件数: {results['total_files']}")
        report_lines.append(f"总链接数: {results['total_links']}")
        report_lines.append(f"问题文件数: {len(results['files_with_issues'])}")
        report_lines.append("")
        
        # 链接分类统计
        total_issues = (results['absolute_path_non_standard'] +
                       results['absolute_path_links'] +
                       results['absolute_path_missing_file'] +
                       results['non_standard_links'] + 
                       results['missing_file_links'] + 
                       results['format_error_links'] + 
                       results['external_missing_links'] +  # 计入问题总数
                       len(results['syntax_errors']))
        
        report_lines.append("链接分类")
        report_lines.append("-" * 40)
        report_lines.append(f"✅ 有效链接: {results['valid_links']} ({results['valid_links']/max(results['total_links'],1)*100:.1f}%)")
        
        if total_issues > 0:
            report_lines.append("")
            report_lines.append("⚠️  问题链接")
            report_lines.append(f"  绝对路径 + 缺少.md: {results['absolute_path_non_standard']}")
            report_lines.append(f"  绝对路径 + 缺少文件或网站错链: {results['absolute_path_missing_file']}")
            report_lines.append(f"  绝对路径链接（有.md）: {results['absolute_path_links']}")
            report_lines.append(f"  相对路径 + 缺少.md: {results['non_standard_links']}")
            report_lines.append(f"  相对路径 + 缺少文件: {results['missing_file_links']}")
            report_lines.append(f"  范围内但未抓取的外链（遗漏）: {results['external_missing_links']}")
            report_lines.append(f"  格式错误: {results['format_error_links']}")
            report_lines.append(f"  语法错误: {len(results['syntax_errors'])}")
        
        if results.get('external_convertible_links', 0) > 0:
            report_lines.append("")
            report_lines.append("ℹ️  可优化链接（建议运行 fix_markdown_links.py）")
            report_lines.append(f"  可转内链的外链: {results['external_convertible_links']}")
        
        report_lines.append("")
        
        # 链接类型统计
        report_lines.append("链接类型分布")
        report_lines.append("-" * 40)
        for link_type, count in results['link_types'].most_common():
            report_lines.append(f"  {link_type}: {count}")
        
        report_lines.append("")
        
        # 详细问题报告（只列举前 10 个）
        if results['absolute_path_missing_file'] > 0 or results['missing_file_links'] > 0:
            report_lines.append("缺少文件或网站错链（最多列举10个，无法区分）")
            report_lines.append("-" * 40)
            missing_counter = Counter()
            for link in results['absolute_path_missing_detail']:
                target = link['target_file']
                missing_counter[target] += 1
            for link in results['missing_file_detail']:
                target = link['target_file']
                missing_counter[target] += 1
            for target, count in missing_counter.most_common(10):
                report_lines.append(f"  {target} (被引用 {count} 次)")
            report_lines.append("")
        
        # 总结
        if total_issues == 0:
            report_lines.append("✅ 所有链接都有效且格式正确")
        else:
            report_lines.append(f"⚠️  共发现 {total_issues} 个问题链接")
        
        return '\n'.join(report_lines)


def main():
    """主函数"""
    import sys
    
    # 必须提供参数
    if len(sys.argv) < 2:
        print('用法: python check_markdown_links.py <目录>')
        sys.exit(1)
    
    target_dir = Path(sys.argv[1])
    
    # 检查目录是否存在
    if not target_dir.exists():
        print(f'错误: 目录不存在: {target_dir}')
        sys.exit(1)
    
    # 创建检查器
    checker = MarkdownLinkChecker(target_dir)
    
    # 前置检查：pending_urls 是否为空
    is_complete, pending = checker.check_scraping_complete()
    if not is_complete:
        print("⚠️  抓取未完成，pending_urls 不为空：")
        for url in pending[:10]:
            print(f"  - {url}")
        if len(pending) > 10:
            print(f"  ... 还有 {len(pending) - 10} 个")
        print("\n请先完成抓取后再进行链接检查。")
        sys.exit(1)
    
    # 检查所有链接
    results = checker.check_all_links()
    
    # 生成并打印报告
    report = checker.generate_report(results)
    print(report)
    
    # 如果发现遗漏的外链，特殊处理并提示
    if results.get('external_missing_links', 0) > 0:
        print("\n⚠️  发现范围内但未抓取的外链（工作流遗漏）：")
        # 合并所有遗漏外链
        missing_urls = set()
        for link in results.get('external_missing_detail', []):
            missing_urls.add(link['link_url'])
            
        # 打印部分示例
        sorted_urls = sorted(list(missing_urls))
        for url in sorted_urls[:10]:
            print(f"  - {url}")
        if len(sorted_urls) > 10:
            print(f"  ... 还有 {len(sorted_urls) - 10} 个")
            
        print("\n建议：将以上 URL 添加到抓取队列后重新运行。")
    
    # 如果有问题链接，返回非零退出码
    total_issues = (results['absolute_path_non_standard'] +
                   results['absolute_path_links'] +
                   results['absolute_path_missing_file'] +
                   results['non_standard_links'] + 
                   results['missing_file_links'] + 
                   results['format_error_links'] + 
                   results['external_missing_links'] +
                   len(results['syntax_errors']))
    
    if total_issues > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
