#!/usr/bin/env python3
"""
Merge Compressed Bundles Script

Automatically merges compressed bundle files into a single AI reference document.
Handles validation, token estimation, single/multi-file output, and cleanup.

Usage:
    python merge_refs.py -d <compressed_dir> -o <output_file> --max-size 40
"""

import os
import re
import argparse
from pathlib import Path
import json


def load_manifest(manifest_path: Path) -> dict:
    """Load manifest.json with bundle metadata"""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_source_markers(content: str) -> list[str]:
    """Extract all <!-- Source: ... --> markers from content"""
    pattern = r"<!-- Source:\s*([^\s]+(?:\s+[^\s]+)?)\s*-->"
    matches = re.findall(pattern, content)
    return matches


def validate_compressed_bundle(bundle_path: Path, manifest_entry: dict) -> dict:
    """
    Validate a compressed bundle file

    Returns:
        dict: {
            'valid': bool,
            'source_markers_found': int,
            'source_markers_expected': int,
            'missing_markers': list[str],
            'malformed_markers': list[str],
            'errors': list[str]
        }
    """
    if not bundle_path.exists():
        return {
            "valid": False,
            "source_markers_found": 0,
            "source_markers_expected": len(manifest_entry.get("source_files", [])),
            "missing_markers": manifest_entry.get("source_files", []),
            "malformed_markers": [],
            "errors": [f"Bundle file not found: {bundle_path}"],
        }

    content = bundle_path.read_text(encoding="utf-8")
    markers_found = extract_source_markers(content)
    source_files = manifest_entry.get("source_files", [])

    # Check for malformed markers
    all_comment_blocks = re.findall(r"<!--.*?-->", content, re.DOTALL)
    malformed = []
    for block in all_comment_blocks:
        if "Source:" in block and not block.strip().startswith("<!-- Source:"):
            malformed.append(block.strip())

    # Find expected but missing markers
    expected_files = [f.split("#")[0] for f in source_files]  # Remove chunk indices
    found_files = markers_found
    missing = [f for f in expected_files if f not in found_files]

    return {
        "valid": len(missing) == 0 and len(malformed) == 0,
        "source_markers_found": len(markers_found),
        "source_markers_expected": len(source_files),
        "missing_markers": missing,
        "malformed_markers": malformed,
        "errors": []
        if len(missing) == 0
        else [f"Missing {len(missing)} Source markers"],
    }


def estimate_token_count(text: str) -> int:
    """
    Estimate token count for markdown text
    Approximation: ~1 token per 4 characters for English text
    Adjusted for code content (~1.3x)
    """
    # Count code blocks (they consume more tokens)
    code_blocks = re.findall(r"```[\s\S]*?```", text)
    code_chars = sum(len(cb) for cb in code_blocks)

    # Count non-code text
    non_code_text = re.sub(r"```[\s\S]*?```", "", text)
    non_code_chars = len(non_code_text)

    # Estimate: code ~1.3 chars/token, text ~4 chars/token
    estimated_tokens = int(code_chars / 1.3 + non_code_chars / 4)

    return estimated_tokens


def merge_refs(bundle_paths: list[Path], output_path: Path, max_size_k: int) -> dict:
    """
    Merge compressed bundles into output file(s)

    Args:
        bundle_paths: List of compressed bundle file paths
        output_path: Path for output file(s)
        max_size_k: Maximum size in k (tokens / 1000)

    Returns:
        dict: {
            'output_files': list[str],
            'total_tokens': int,
            'split_into_multiple': bool,
            'files': list[dict]  # Details for each output file
        }
    """
    # Read all bundle contents in order
    all_sections = []
    total_tokens = 0

    for bundle_path in sorted(bundle_paths):
        content = bundle_path.read_text(encoding="utf-8")
        tokens = estimate_token_count(content)
        all_sections.append({"path": bundle_path, "content": content, "tokens": tokens})
        total_tokens += tokens

    max_tokens = max_size_k * 1000
    print(f"\nEstimated total tokens: {total_tokens:,} ({total_tokens / 1000:.1f}k)")

    # Determine output strategy
    if total_tokens <= max_tokens:
        return merge_single_file(all_sections, output_path, total_tokens, max_tokens)
    else:
        return merge_multiple_files(all_sections, output_path, max_tokens, total_tokens)


def merge_single_file(
    sections: list[dict], output_path: Path, total_tokens: int, max_tokens: int
) -> dict:
    """Merge all sections into a single file"""
    print(
        f"Total tokens under limit ({total_tokens:,} <= {max_tokens:,}), creating single file"
    )

    merged_content = ""

    # Add AI Reference header
    merged_content += "> **AI Reference**: This document is designed for AI Agent consumption. Maintain concise, high-density style when modifying.\n\n"
    merged_content += "---\n\n"

    # Merge all sections
    for section in sections:
        merged_content += section["content"] + "\n\n"

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(merged_content)

    return {
        "output_files": [str(output_path)],
        "total_tokens": total_tokens,
        "split_into_multiple": False,
        "files": [{"path": str(output_path), "tokens": total_tokens}],
    }


def merge_multiple_files(
    sections: list[dict], output_path: Path, max_tokens: int, total_tokens: int
) -> dict:
    """Split sections into multiple files based on token limit"""
    print(
        f"Total tokens exceed limit ({total_tokens:,} > {max_tokens:,}), splitting into multiple files"
    )

    output_files = []
    current_content = ""
    current_tokens = 0
    file_index = 1

    # Add AI Reference header to first file
    ai_reference_header = "> **AI Reference**: This document is designed for AI Agent consumption. Maintain concise, high-density style when modifying.\n\n---\n\n"

    for section in sections:
        section_tokens = section["tokens"]
        section_with_header = ai_reference_header if len(output_files) == 0 else ""

        # Check if adding this section would exceed limit
        if current_tokens + section_tokens > max_tokens and current_content:
            # Write current file
            file_name = output_path.stem + f"_{file_index:02d}" + output_path.suffix
            file_path = output_path.parent / file_name

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(current_content)

            output_files.append({"path": str(file_path), "tokens": current_tokens})

            # Reset for next file
            current_content = (
                ai_reference_header if len(output_files) > 0 else section_with_header
            )
            current_tokens = 0
            file_index += 1

        # Add section
        if not current_content:
            current_content = section_with_header
            current_tokens = estimate_token_count(section_with_header)

        current_content += section["content"] + "\n\n"
        current_tokens += section_tokens

    # Write last file
    if current_content:
        file_name = output_path.stem + f"_{file_index:02d}" + output_path.suffix
        file_path = output_path.parent / file_name

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(current_content)

        output_files.append({"path": str(file_path), "tokens": current_tokens})

    return {
        "output_files": [f["path"] for f in output_files],
        "total_tokens": total_tokens,
        "split_into_multiple": True,
        "files": output_files,
    }


def generate_verification_report(
    results: dict, output_files: dict, manifest: dict
) -> str:
    """Generate a human-readable verification report"""
    report = []
    report.append("=" * 80)
    report.append("MERGE VERIFICATION REPORT")
    report.append("=" * 80)
    report.append("")

    # Validation results
    report.append("VALIDATION RESULTS")
    report.append("-" * 80)
    all_valid = True
    for i, (bundle_name, validation) in enumerate(results["validations"].items(), 1):
        status = "✓ PASS" if validation["valid"] else "✗ FAIL"
        report.append(f"{i}. {bundle_name}: {status}")

        if not validation["valid"]:
            all_valid = False
            for error in validation["errors"]:
                report.append(f"   - ERROR: {error}")
            if validation["missing_markers"]:
                report.append(
                    f"   - Missing Source markers: {len(validation['missing_markers'])}"
                )
                for missing in validation["missing_markers"][:3]:
                    report.append(f"     * {missing}")
                if len(validation["missing_markers"]) > 3:
                    report.append(
                        f"     ... and {len(validation['missing_markers']) - 3} more"
                    )
            if validation["malformed_markers"]:
                report.append(
                    f"   - Malformed markers: {len(validation['malformed_markers'])}"
                )

        report.append(
            f"   Source markers: {validation['source_markers_found']}/{validation['source_markers_expected']}"
        )

    report.append("")

    # Output summary
    report.append("OUTPUT SUMMARY")
    report.append("-" * 80)
    report.append(f"Total bundles processed: {len(results['validations'])}")
    total_tokens = output_files["total_tokens"]
    total_k = total_tokens / 1000
    report.append(f"Total tokens estimated: {total_tokens:,} ({total_k:.1f}k)")
    report.append(
        f"Split into multiple files: {'Yes' if output_files['split_into_multiple'] else 'No'}"
    )
    report.append(f"Output files created: {len(output_files['output_files'])}")
    report.append("")

    for i, file_info in enumerate(output_files["files"], 1):
        tokens = file_info["tokens"]
        size_k = tokens / 1000
        report.append(f"{i}. {file_info['path']}")
        report.append(f"   Tokens: {tokens:,} ({size_k:.1f}k)")

    report.append("")

    # Final status
    report.append("=" * 80)
    if all_valid:
        report.append("✓ ALL VALIDATIONS PASSED")
    else:
        report.append("✗ VALIDATION FAILED - Review errors above")
    report.append("=" * 80)

    return "\n".join(report)


def cleanup_temp_files(compressed_dir: Path):
    """Remove compressed directory"""
    if compressed_dir.exists():
        import shutil

        shutil.rmtree(compressed_dir)
        print(f"\nCleaned up temporary directory: {compressed_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Merge compressed bundles into AI reference document",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "-d",
        "--bundles-dir",
        type=str,
        required=True,
        help="Directory containing .bundles_temp folder",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        required=True,
        help="Output file path (e.g., docs/ai-references/Product/reference.md)",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=40,
        help="Maximum size in k (tokens/1000) per output file (default: 40)",
    )
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep compressed directory for debugging",
    )

    args = parser.parse_args()

    # Setup paths
    bundles_base = Path(args.bundles_dir)
    bundles_temp_dir = bundles_base / ".bundles_temp"
    compressed_dir = bundles_temp_dir / "compressed"
    manifest_path = bundles_temp_dir / "manifest.json"
    output_path = Path(args.output)

    print(f"Looking for compressed bundles in: {compressed_dir}")
    print(f"Manifest path: {manifest_path}")
    print(f"Output path: {output_path}")

    # Load manifest
    try:
        manifest = load_manifest(manifest_path)
        print(f"\nLoaded manifest with {len(manifest)} bundles")
    except FileNotFoundError as e:
        print(f"\n✗ ERROR: {e}")
        print("Make sure bundle_docs.py was run first")
        return

    # Find all compressed bundle files
    if not compressed_dir.exists():
        print(f"\n✗ ERROR: Compressed directory not found: {compressed_dir}")
        print("Please run sub-agents to generate compressed bundles first")
        return

    compressed_files = sorted(compressed_dir.glob("*_compressed.md"))
    if not compressed_files:
        print(f"\n✗ ERROR: No compressed bundles found in {compressed_dir}")
        print("Please run sub-agents to generate compressed bundles first")
        return

    print(f"\nFound {len(compressed_files)} compressed bundle files")

    # Validate all bundles
    print("\nValidating compressed bundles...")
    validation_results = {"validations": {}}

    for bundle_file in compressed_files:
        # Find corresponding manifest entry
        bundle_name = bundle_file.stem.replace("_compressed", "")
        manifest_entry = next((m for m in manifest if m["name"] == bundle_name), None)

        if not manifest_entry:
            print(f"⚠ Warning: No manifest entry found for {bundle_name}")
            continue

        validation = validate_compressed_bundle(bundle_file, manifest_entry)
        validation_results["validations"][bundle_name] = validation

        status = "✓" if validation["valid"] else "✗"
        print(
            f"{status} {bundle_name}: {validation['source_markers_found']}/{validation['source_markers_expected']} Source markers"
        )

        if validation["missing_markers"]:
            print(f"   Missing: {', '.join(validation['missing_markers'][:3])}")

    # Check if all validations passed
    all_valid = all(v["valid"] for v in validation_results["validations"].values())
    if not all_valid:
        print("\n✗ Validation failed! Please review and fix issues before merging.")
        print("Most common fixes:")
        print(
            "  1. Check that Source markers are preserved: <!-- Source: path/to/file.md -->"
        )
        print("  2. Ensure marker format matches manifest exactly")
        print("  3. Verify no markers were accidentally removed during compression")
        return

    # Merge bundles
    print("\nMerging compressed bundles...")
    merge_result = merge_refs(compressed_files, output_path, args.max_size)

    # Generate and print report
    report = generate_verification_report(validation_results, merge_result, manifest)
    print("\n" + report)

    # Save report
    report_path = output_path.parent / f"{output_path.stem}_verification_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nVerification report saved to: {report_path}")

    # Cleanup
    if not args.keep_temp:
        cleanup_temp_files(compressed_dir)
    else:
        print(f"\nKeeping temporary directory for debugging: {compressed_dir}")

    print("\n✓ Merge complete!")


if __name__ == "__main__":
    main()
