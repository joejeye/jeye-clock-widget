#!/usr/bin/env python3
"""
Script to add white fill attribute to all SVG path elements in files under a given folder.
Replaces '<path d=' with '<path fill="white" d=' in all files.
"""

import os
import re
import argparse
from pathlib import Path


def process_file(file_path):
    """
    Process a single file to replace path elements with white fill.
    
    Args:
        file_path (Path): Path to the file to process
        
    Returns:
        bool: True if file was modified, False otherwise
    """
    try:
        # Read the file content
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace '<path d=' with '<path fill="white" d='
        # Use regex to handle different spacing and avoid double-adding fill attribute
        original_content = content
        
        # First, check if there are already paths with fill attributes to avoid duplicates
        # Replace only paths that don't already have a fill attribute
        pattern = r'<path\s+(?!.*fill=)([^>]*?)d='
        replacement = r'<path fill="white" \1d='
        content = re.sub(pattern, replacement, content)
        
        # Also handle the case where d= comes first
        pattern2 = r'<path\s+d=([^>]*?)(?!\s*fill=)'
        replacement2 = r'<path fill="white" d=\1'
        content = re.sub(pattern2, replacement2, content)
        
        # If content changed, write it back
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as file:
                file.write(content)
            return True
        
        return False
        
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False


def process_folder(folder_path, file_extensions=None, recursive=True):
    """
    Process all files in a folder to add white fill to SVG paths.
    
    Args:
        folder_path (str): Path to the folder to process
        file_extensions (list): List of file extensions to process (default: ['.svg'])
        recursive (bool): Whether to process subfolders recursively
    """
    if file_extensions is None:
        file_extensions = ['.svg']
    
    folder = Path(folder_path)
    
    if not folder.exists():
        print(f"Error: Folder '{folder_path}' does not exist.")
        return
    
    if not folder.is_dir():
        print(f"Error: '{folder_path}' is not a directory.")
        return
    
    modified_files = []
    total_files = 0
    
    # Get all files to process
    if recursive:
        files = folder.rglob('*')
    else:
        files = folder.glob('*')
    
    for file_path in files:
        if file_path.is_file() and file_path.suffix.lower() in file_extensions:
            total_files += 1
            print(f"Processing: {file_path}")
            
            if process_file(file_path):
                modified_files.append(file_path)
                print(f"  ✓ Modified")
            else:
                print(f"  - No changes needed")
    
    # Print summary
    print(f"\nSummary:")
    print(f"Total files processed: {total_files}")
    print(f"Files modified: {len(modified_files)}")
    
    if modified_files:
        print(f"\nModified files:")
        for file_path in modified_files:
            print(f"  {file_path}")


def main():
    """Main function to handle command line arguments."""
    parser = argparse.ArgumentParser(
        description="Add white fill attribute to SVG path elements in files"
    )
    parser.add_argument(
        "folder",
        help="Path to the folder containing files to process"
    )
    parser.add_argument(
        "--extensions",
        nargs='+',
        default=['.svg'],
        help="File extensions to process (default: .svg)"
    )
    parser.add_argument(
        "--no-recursive",
        action='store_true',
        help="Don't process subfolders recursively"
    )
    
    args = parser.parse_args()
    
    # Ensure extensions start with a dot
    extensions = [ext if ext.startswith('.') else f'.{ext}' for ext in args.extensions]
    
    recursive = not args.no_recursive
    
    print(f"Processing folder: {args.folder}")
    print(f"File extensions: {extensions}")
    print(f"Recursive: {recursive}")
    print("-" * 50)
    
    process_folder(args.folder, extensions, recursive)


if __name__ == "__main__":
    main()
