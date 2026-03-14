#!/usr/bin/env python3
"""
Smart Document Chunking Script

Intelligently splits Markdown documents into chunks based on size limits:
- Large files split by headings (## first, then ###)
- Adjacent small sections auto-merged
- Small files grouped by directory
- Generates manifest.json for parallel processing
- All paths are relative to project root (auto-detected)

Usage:
    python bundle_docs.py -i <input_dir> -o <output_dir> --max-size <KB>

Example:
    python bundle_docs.py -i ./docs -o ./bundles --max-size 40
"""

import os
import shutil
import argparse
from pathlib import Path
import json


def find_project_root(start_path: Path) -> Path:
    """
    Find project root by looking for common markers:
    - .git directory
    - pyproject.toml
    - package.json
    - requirements.txt
    - .gitignore
    """
    current = start_path
    markers = ['.git', 'pyproject.toml', 'package.json', 'requirements.txt', '.gitignore', 'SKILL.md', 'README.md']

    for parent in [current] + list(current.parents):
        if any((parent / marker).exists() for marker in markers):
            return parent

    # Fallback to current working directory
    return Path.cwd().absolute()


def resolve_symlink_preserved(input_path: str, project_root: Path) -> tuple[Path, Path]:
    """
    解析路径，保留用户输入的软链接形式

    Returns:
        tuple: (absolute_path_without_resolve, user_input_base_path)
        - absolute_path_without_resolve: 使用 .absolute() 而非 .resolve()，保留软链接
        - user_input_base_path: 用户输入的基础路径（用于计算相对路径）
    """
    input_p = Path(input_path)

    # 使用 absolute() 而不是 resolve()，保留符号链接
    # absolute() 只是把相对路径转绝对路径，不解析符号链接
    absolute_path = input_p.absolute()

    # 保存用户输入的原始形式（不含文件名部分）
    if input_p.is_dir():
        user_input_base = absolute_path
    else:
        user_input_base = absolute_path.parent

    return absolute_path, user_input_base


def get_file_size(fp: Path) -> int:
    """Get file size in bytes"""
    return fp.stat().st_size


def get_bundle_meta_size(file_count: int) -> int:
    """Estimate metadata overhead (path info, etc.)"""
    return file_count * 200


def split_by_heading_level(content: str, heading_marker: str) -> list[dict]:
    """Split content by specified heading level"""
    lines = content.split("\n")
    sections = []
    current_section = []
    current_title = "Introduction"

    for line in lines:
        if line.startswith(heading_marker + " "):
            if current_section:
                section_content = "\n".join(current_section).strip()
                if section_content:
                    sections.append({"title": current_title, "content": section_content})
            current_title = line[len(heading_marker)+1:].strip()
            current_section = [line]
        else:
            current_section.append(line)

    if current_section:
        section_content = "\n".join(current_section).strip()
        if section_content:
            sections.append({"title": current_title, "content": section_content})

    return sections


def split_by_paragraphs(content: str, max_size: int) -> list[dict]:
    """Split by paragraphs, preserving paragraph integrity"""
    paragraphs = content.split("\n\n")
    sections = []
    current_content = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para.encode("utf-8"))
        para_with_newline = para + "\n\n"
        para_with_newline_size = len(para_with_newline.encode("utf-8"))

        if current_size + para_with_newline_size > max_size and current_content:
            sections.append({
                "title": f"Paragraph {len(sections)+1}",
                "content": "\n\n".join(current_content).strip()
            })
            current_content = [para]
            current_size = para_size
        else:
            current_content.append(para)
            current_size += para_with_newline_size

    if current_content:
        sections.append({
            "title": f"Paragraph {len(sections)+1}",
            "content": "\n\n".join(current_content).strip()
        })

    return sections


def force_split(content: str, title_prefix: str, max_size: int) -> list[dict]:
    """Force split by character count, preferring newline boundaries"""
    result = []
    remaining = content
    chunk_num = 1

    while remaining:
        if len(remaining.encode("utf-8")) <= max_size:
            result.append({
                "title": f"{title_prefix} - Part {chunk_num}",
                "content": remaining.strip(),
                "size": len(remaining.encode("utf-8"))
            })
            break

        chunk = remaining[:max_size]
        last_newline = chunk.rfind("\n")
        if last_newline > max_size * 0.5:
            chunk = chunk[:last_newline]

        result.append({
            "title": f"{title_prefix} - Part {chunk_num}",
            "content": chunk.strip(),
            "size": len(chunk.encode("utf-8"))
        })

        remaining = remaining[len(chunk):].strip()
        chunk_num += 1

    return result


def split_large_file_by_headings(fp: Path, rel_path: Path, max_size: int) -> list[dict]:
    """
    Split large file by headings
    Prefer ## first, then ###
    Adjacent small sections auto-merged
    """
    content = fp.read_text(encoding="utf-8")

    # Try splitting by H2 first
    sections = split_by_heading_level(content, "##")

    if len(sections) <= 1:
        sections = split_by_heading_level(content, "###")

    if len(sections) <= 1:
        sections = split_by_paragraphs(content, max_size)

    # Merge adjacent small sections
    result = []
    current_chunk = None
    current_size = 0

    for section in sections:
        section_size = len(section["content"].encode("utf-8"))

        if section_size > max_size:
            if current_chunk:
                result.append(current_chunk)
                current_chunk = None
                current_size = 0
            sub_sections = force_split(section["content"], section["title"], max_size)
            result.extend(sub_sections)
        else:
            if current_chunk and (current_size + section_size <= max_size):
                current_chunk["content"] += "\n\n" + section["content"]
                current_chunk["title"] += " + " + section["title"]
                current_size += section_size
            else:
                if current_chunk:
                    result.append(current_chunk)
                current_chunk = {
                    "title": section["title"],
                    "content": section["content"],
                    "size": section_size
                }
                current_size = section_size

    if current_chunk:
        result.append(current_chunk)

    for chunk in result:
        chunk["size"] = len(chunk["content"].encode("utf-8"))

    return result


def bundle_files(source_dir: str, output_dir: str, max_size_kb: int) -> dict:
    """
    Main function for intelligent document chunking

    Returns:
        dict: Contains manifest and temp_dir paths
    """
    # Find project root first
    temp_path = Path(source_dir).absolute()
    project_root = find_project_root(temp_path)
    print(f"Project root detected: {project_root}")

    # 解析路径，保留软链接形式
    source_path, user_input_base = resolve_symlink_preserved(source_dir, project_root)
    output_path = Path(output_dir)
    max_size = max_size_kb * 1024
    max_size_with_meta = int(max_size_kb * 1024 * 0.9)

    print(f"Source path (symlink preserved): {source_path}")
    print(f"User input base: {user_input_base}")

    if not source_path.exists():
        print(f"Error: Input directory does not exist: {source_dir}")
        return None

    output_path.mkdir(parents=True, exist_ok=True)

    # Create temp directory under output directory
    temp_dir = output_path / ".bundles_temp"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    # Collect all Markdown files
    all_files = []
    for root, dirs, files in os.walk(source_path):
        root_path = Path(root)
        if "assets" in root_path.parts or "images" in root_path.parts:
            continue
        for file in files:
            if file.endswith(".md") or file.endswith(".mdx"):
                fp = root_path / file
                all_files.append(fp)

    print(f"Found {len(all_files)} Markdown files")

    # Separate large and small files
    large_files = [f for f in all_files if get_file_size(f) > max_size_with_meta]
    small_files = [f for f in all_files if get_file_size(f) <= max_size_with_meta]

    print(f"Large files (>{max_size_kb}K): {len(large_files)}")
    print(f"Small files (<={max_size_kb}K): {len(small_files)}")

    bundles = []

    # Process large files: split by headings
    for fp in large_files:
        # 计算相对于项目根目录的路径（保留软链接）
        rel_path_from_project = fp.relative_to(project_root)
        chunks = split_large_file_by_headings(fp, rel_path_from_project, max_size_with_meta)

        for i, chunk in enumerate(chunks):
            chunk_name = f"{rel_path_from_project.stem}_part{i+1:02d}"
            bundles.append({
                "name": chunk_name,
                "files": [],
                "total_size": chunk["size"],
                "is_large": True,
                "original_path": str(rel_path_from_project),
                "is_split": True,
                "chunk_title": chunk["title"],
                "chunk_content": chunk["content"],
                "chunk_index": i + 1,
                "chunk_total": len(chunks)
            })
        print(f"  {rel_path_from_project} -> {len(chunks)} parts")

    # Process small files: group by directory
    dir_groups = {}
    for fp in small_files:
        # 计算相对于项目根目录的路径（保留软链接）
        rel_path_from_project = fp.relative_to(project_root)
        parent = str(rel_path_from_project.parent) if rel_path_from_project.parent != Path(".") else "_root"
        if parent not in dir_groups:
            dir_groups[parent] = []
        dir_groups[parent].append(fp)

    bundle_counter = {}
    for dir_name, files in sorted(dir_groups.items()):
        current_bundle = []
        current_size = 0

        for fp in sorted(files):
            fp_size = get_file_size(fp)
            meta_size = get_bundle_meta_size(len(current_bundle) + 1)

            if current_bundle and (current_size + fp_size + meta_size > max_size_with_meta):
                base_name = dir_name.replace("/", "_").replace("\\", "_")
                bundle_counter[base_name] = bundle_counter.get(base_name, 0) + 1
                bundle_name = f"{base_name}_part{bundle_counter[base_name]:02d}"

                bundles.append({
                    "name": bundle_name,
                    "files": current_bundle.copy(),
                    "total_size": current_size,
                    "is_large": False,
                    "original_dir": dir_name
                })

                current_bundle = [fp]
                current_size = fp_size
            else:
                current_bundle.append(fp)
                current_size += fp_size

        if current_bundle:
            base_name = dir_name.replace("/", "_").replace("\\", "_")
            bundle_counter[base_name] = bundle_counter.get(base_name, 0) + 1
            bundle_name = f"{base_name}_part{bundle_counter[base_name]:02d}"

            bundles.append({
                "name": bundle_name,
                "files": current_bundle.copy(),
                "total_size": current_size,
                "is_large": False,
                "original_dir": dir_name
            })

    # Create bundle files (in temp directory)
    manifest = []
    for bundle_info in bundles:
        bundle_name = bundle_info["name"]
        file_paths = bundle_info["files"]
        bundle_path = temp_dir / f"{bundle_name}.md"

        manifest_entry = {
            "bundle_file": str(bundle_path.relative_to(temp_dir)),
            "name": bundle_name,
            "file_count": len(file_paths) if not bundle_info.get("is_split") else 1,
            "total_size_bytes": bundle_info["total_size"],
            "total_size_kb": round(bundle_info["total_size"] / 1024, 2),
            "is_large_file": bundle_info.get("is_large", False),
            "source_files": []
        }

        with open(bundle_path, "w", encoding="utf-8") as outfile:
            outfile.write(f"# Bundle: {bundle_name}\n")

            if bundle_info.get("is_large") and bundle_info.get("is_split"):
                src = bundle_info['original_path']
                idx = bundle_info['chunk_index']
                total = bundle_info['chunk_total']
                outfile.write(f"\n<!-- Source: {src} -->\n")
                outfile.write(bundle_info["chunk_content"])

                manifest_entry["chunk_index"] = idx
                manifest_entry["chunk_total"] = total
                manifest_entry["source_files"].append(f"{src}#{idx}")
            else:
                manifest_entry["original_dir"] = bundle_info.get("original_dir", "")
                for fp in file_paths:
                    # 计算相对于项目根目录的路径（保留软链接）
                    rel_path_from_project = fp.relative_to(project_root)
                    manifest_entry["source_files"].append(str(rel_path_from_project))
                    try:
                        content = fp.read_text(encoding="utf-8")
                        outfile.write(f"\n<!-- Source: {rel_path_from_project} -->\n")
                        outfile.write(content)
                    except Exception as e:
                        print(f"Error reading {fp}: {e}")

        manifest.append(manifest_entry)

    # Save manifest
    manifest_path = temp_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Created {len(bundles)} bundles")
    print(f"Temp directory: {temp_dir}")
    print(f"Manifest: {manifest_path}")

    return {
        "manifest": manifest,
        "temp_dir": str(temp_dir),
        "manifest_path": str(manifest_path),
        "bundle_count": len(bundles)
    }


def main():
    parser = argparse.ArgumentParser(
        description="Smart document chunking for AI Agent batch processing",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "-i", "--input",
        type=str,
        required=True,
        help="Input directory"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        required=True,
        help="Output directory"
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=40,
        help="Max file size in KB (default: 40KB)"
    )

    args = parser.parse_args()
    bundle_files(args.input, args.output, args.max_size)


if __name__ == "__main__":
    main()
