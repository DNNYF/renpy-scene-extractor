import sys
import os
import argparse
import json

def list_rpa(path):
    # Retrieve file list from RPA
    # TODO: Implement unrpa integration
    print(json.dumps({"files": []}))

def extract_rpa(path, output_dir, key=None):
    # Extract files from RPA
    # TODO: Implement unrpa integration
    print(json.dumps({"status": "extraction_pending"}))

def main():
    parser = argparse.ArgumentParser(description="Ren'py Scene Extractor Backend")
    subparsers = parser.add_subparsers(dest="command")

    list_parser = subparsers.add_parser("list", help="List files in RPA archive")
    list_parser.add_argument("path", help="Path to RPA file")

    extract_parser = subparsers.add_parser("extract", help="Extract files from RPA archive")
    extract_parser.add_argument("path", help="Path to RPA file")
    extract_parser.add_argument("output", help="Output directory")
    extract_parser.add_argument("--key", help="Encryption key (hex)", default=None)

    args = parser.parse_args()

    if args.command == "list":
        list_rpa(args.path)
    elif args.command == "extract":
        extract_rpa(args.path, args.output, args.key)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
