#!/usr/bin/env python3
"""
Ren'Py Archive (RPA) Tool
Supports scanning, listing, and extracting files from RPA-2.0, RPA-3.0, and RPA-3.2 archives.
Communicates via JSON over stdin/stdout for integration with Electron.
"""

import os
import sys
import json
import struct
import pickle
import zlib
import tempfile
import hashlib

# --- Fix for Pickle Loading (ArchiveView) ---

class ArchiveView:
    """
    Mock class for renpy.loader.ArchiveView.
    Some RPA archives pickle this class instead of tuples.
    """
    def __init__(self, offset=0, length=0, prefix=b''):
        self.offset = offset
        self.length = length
        self.prefix = prefix

    def __repr__(self):
        return f"ArchiveView(offset={self.offset}, length={self.length}, prefix={self.prefix})"

# Mock the renpy.loader module so pickle finds the class
class MockModule:
    pass

# We need to ensure 'renpy.loader' points to this module
# or that pickle can find ArchiveView here.
# Since we can't easily inject into pickle's lookup without
# mocking modules, we'll do this:
sys.modules['renpy'] = MockModule()
sys.modules['renpy.loader'] = sys.modules[__name__]

# --------------------------------------------

# --- RPA Parsing Logic ---

def read_header(f):
    """Read the RPA header and return (version, offset, key)."""
    header = f.readline().decode('utf-8', errors='replace').strip()

    if header.startswith('RPA-3.2'):
        parts = header.split()
        offset = int(parts[1], 16)
        key = 0
        for subkey in parts[2:]:
            key ^= int(subkey, 16)
        return '3.2', offset, key

    elif header.startswith('RPA-3.0'):
        parts = header.split()
        offset = int(parts[1], 16)
        key = int(parts[2], 16)
        return '3.0', offset, key

    elif header.startswith('RPA-2.0'):
        parts = header.split()
        offset = int(parts[1], 16)
        return '2.0', offset, 0

    else:
        raise ValueError(f'Unsupported RPA format: {header[:20]}')


def read_index(f, version, offset, key):
    """Read and decode the file index from an RPA archive."""
    f.seek(offset)
    index_data = f.read()

    try:
        index_data = zlib.decompress(index_data)
    except zlib.error:
        pass  # Some archives may not be compressed

    try:
        index = pickle.loads(index_data)
    except Exception as e:
        # Fallback for some weird pickles or if loading fails
        raise ValueError(f"Failed to unpickle index: {e}")

    # Decode the index entries
    result = {}
    for filename, entries in index.items():
        if isinstance(filename, bytes):
            filename = filename.decode('utf-8', errors='replace')

        file_entries = []
        for entry in entries:
            entry_offset = 0
            entry_length = 0
            prefix = b''
            
            # Handle standard tuples
            if isinstance(entry, (list, tuple)):
                if len(entry) == 2:
                    entry_offset, entry_length = entry
                elif len(entry) == 3:
                    entry_offset, entry_length, prefix = entry
                else:
                    continue
            # Handle ArchiveView objects
            elif isinstance(entry, ArchiveView):
                entry_offset = entry.offset
                entry_length = entry.length
                prefix = entry.prefix
            else:
                # Unknown entry type
                continue

            if version in ('3.0', '3.2'):
                entry_offset ^= key
                entry_length ^= key

            file_entries.append({
                'offset': entry_offset,
                'length': entry_length,
                'prefix': prefix if isinstance(prefix, bytes) else b''
            })

        result[filename] = file_entries

    return result


def extract_file(archive_path, filename, entries, output_dir, final_name=None):
    """Extract a single file from the RPA archive."""
    os.makedirs(output_dir, exist_ok=True)

    if final_name:
        safe_name = os.path.basename(final_name)
    else:
        # Use only the basename to avoid path traversal
        safe_name = os.path.basename(filename)
        if not safe_name:
            safe_name = hashlib.md5(filename.encode()).hexdigest()

    output_path = os.path.join(output_dir, safe_name)

    with open(archive_path, 'rb') as f:
        with open(output_path, 'wb') as out:
            for entry in entries:
                f.seek(entry['offset'])
                data = f.read(entry['length'])

                prefix = entry.get('prefix', b'')
                if isinstance(prefix, str):
                    prefix = prefix.encode('latin-1')
                if prefix:
                    data = prefix + data

                out.write(data)

    return output_path


# --- File type detection ---

VIDEO_EXTENSIONS = {'.webm', '.mp4', '.mkv', '.avi', '.ogv', '.mov', '.flv'}
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tga'}
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.flac', '.aac', '.opus'}

def classify_file(filename):
    """Classify a file by its extension."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in VIDEO_EXTENSIONS:
        return 'video'
    elif ext in IMAGE_EXTENSIONS:
        return 'image'
    elif ext in AUDIO_EXTENSIONS:
        return 'audio'
    else:
        return 'other'


# --- Command Handlers ---

import shutil

# ... (existing imports)

# --- Command Handlers ---

def cmd_scan(params):
    """Recursively scan a folder for .rpa files AND loose media files."""
    folder = params['path']
    rpa_files = []
    
    if not os.path.isdir(folder):
        return {'success': False, 'error': f"Directory found: {folder}"}

    loose_media_size = 0
    loose_media_count = 0
    has_loose_media = False

    for root, dirs, files in os.walk(folder):
        for f in sorted(files):
            # Check for RPA
            if f.lower().endswith('.rpa'):
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    rpa_files.append({
                        'path': full_path,
                        'name': f,
                        'size': size,
                        'relative': os.path.relpath(full_path, folder)
                    })
                except OSError:
                    pass
            
            # Check for loose media
            # Only count if in the root folder or we decide to support recursive loose files
            # The user's request implies "directly .webm" in the game folder.
            # Let's support recursive but group them under one "Loose Media" entry?
            # Or maybe just the root folder?
            # Let's stick to simple: if we find media files, we add the ROOT folder as a "Virtual Archive"
            
            if classify_file(f) != 'other':
                loose_media_count += 1
                try:
                    loose_media_size += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass

    # If we found any loose media, add a virtual archive entry
    if loose_media_count > 0:
        rpa_files.insert(0, {
            'path': folder,
            'name': '[Loose Media Files]',
            'size': loose_media_size,
            'relative': '.',
            'isVirtual': True
        })

    return {'success': True, 'archives': rpa_files}


def cmd_list(params):
    """List contents of an RPA archive or a directory."""
    archive_path = params['path']
    custom_key = params.get('key', None)

    files = []
    version = 'Directory'

    try:
        if os.path.isdir(archive_path):
            # scan directory for media files
            for root, dirs, filenames in os.walk(archive_path):
                for f in filenames:
                    if classify_file(f) != 'other':
                        full_path = os.path.join(root, f)
                        try:
                            size = os.path.getsize(full_path)
                            rel_name = os.path.relpath(full_path, archive_path).replace('\\', '/')
                            files.append({
                                'name': rel_name,
                                'size': size,
                                'type': classify_file(f),
                                'parts': 1
                            })
                        except OSError:
                            pass
        else:
            with open(archive_path, 'rb') as f:
                version, offset, key = read_header(f)

                if custom_key is not None:
                    # Handle hex string or integer
                    if isinstance(custom_key, str):
                        if custom_key.lower().startswith('0x'):
                            key = int(custom_key, 16)
                        else:
                             try:
                                 key = int(custom_key, 16)
                             except ValueError:
                                 pass 
                    elif isinstance(custom_key, int):
                        key = custom_key

                index = read_index(f, version, offset, key)

            for filename, entries in index.items():
                total_size = sum(e['length'] for e in entries)
                file_type = classify_file(filename)
                files.append({
                    'name': filename,
                    'size': total_size,
                    'type': file_type,
                    'parts': len(entries)
                })

        # Sort: videos first, then images, then audio, then others
        type_order = {'video': 0, 'image': 1, 'audio': 2, 'other': 3}
        files.sort(key=lambda x: (type_order.get(x['type'], 99), x['name']))

        return {
            'success': True,
            'version': version,
            'totalFiles': len(files),
            'files': files
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}


def cmd_extract(params):
    """Extract a specific file to a temp directory."""
    archive_path = params['path']
    target_file = params['filename']
    custom_key = params.get('key', None)
    output_dir = params.get('outputDir', tempfile.mkdtemp(prefix='rpa_'))
    output_filename = params.get('outputFilename', None)

    try:
        if os.path.isdir(archive_path):
            # Handle loose file
            source_path = os.path.join(archive_path, target_file)
            if not os.path.exists(source_path):
                return {'success': False, 'error': f'File not found: {target_file}'}
            
            # Preview Optimization: if outputDir is temp/rpa-extractor, return source path
            # This avoids copying large video files for preview
            if 'rpa-extractor' in output_dir and not output_filename:
                return {
                    'success': True,
                    'outputPath': os.path.abspath(source_path),
                    'type': classify_file(target_file)
                }
            
            # Export: copy file
            os.makedirs(output_dir, exist_ok=True)
            
            dest_name = output_filename if output_filename else os.path.basename(target_file)
            dest_path = os.path.join(output_dir, dest_name)

            if os.path.abspath(source_path) != os.path.abspath(dest_path):
                shutil.copy2(source_path, dest_path)
            
            return {
                'success': True,
                'outputPath': dest_path,
                'type': classify_file(target_file)
            }

        else:
            with open(archive_path, 'rb') as f:
                version, offset, key = read_header(f)

                if custom_key is not None:
                    if isinstance(custom_key, str):
                       if custom_key.lower().startswith('0x'):
                           key = int(custom_key, 16)
                       else:
                           try: key = int(custom_key, 16)
                           except: pass

                index = read_index(f, version, offset, key)

            if target_file not in index:
                # Try case-insensitive match
                for k in index:
                    if k.lower() == target_file.lower():
                        target_file = k
                        break
                else:
                    return {'success': False, 'error': f'File not found: {target_file}'}

        output_path = extract_file(archive_path, target_file, index[target_file], output_dir, final_name=output_filename)



        return {
            'success': True,
            'outputPath': output_path,
            'type': classify_file(target_file)
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}


def cmd_extract_all(params):
    """Extract all files (or filtered by type) to a directory."""
    archive_path = params['path']
    custom_key = params.get('key', None)
    output_dir = params.get('outputDir', tempfile.mkdtemp(prefix='rpa_'))
    filter_type = params.get('filterType', None)  # 'video', 'image', 'audio', None for all

    try:
        with open(archive_path, 'rb') as f:
            version, offset, key = read_header(f)

            if custom_key is not None:
                if isinstance(custom_key, str):
                    if custom_key.lower().startswith('0x'):
                         key = int(custom_key, 16)
                    else:
                         try: key = int(custom_key, 16)
                         except: pass

            index = read_index(f, version, offset, key)

        extracted = []
        for filename, entries in index.items():
            file_type = classify_file(filename)
            if filter_type and file_type != filter_type:
                continue

            output_path = extract_file(archive_path, filename, entries, output_dir)
            extracted.append({
                'name': filename,
                'outputPath': output_path,
                'type': file_type
            })

        return {
            'success': True,
            'outputDir': output_dir,
            'extractedCount': len(extracted),
            'files': extracted
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}


# --- Main Entry Point ---

COMMANDS = {
    'scan': cmd_scan,
    'list': cmd_list,
    'extract': cmd_extract,
    'extractAll': cmd_extract_all,
}

def main():
    """Main loop: read JSON commands from stdin, write JSON responses to stdout."""
    # If called with command-line arguments, handle single command mode
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == '--help':
            print(json.dumps({
                'commands': list(COMMANDS.keys()),
                'usage': 'echo \'{"command": "scan", "params": {"path": "/path/to/game"}}\' | python rpa_tool.py'
            }))
            sys.exit(0)

    # Interactive mode: read lines of JSON from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            command = request.get('command', '')
            params = request.get('params', {})

            handler = COMMANDS.get(command)
            if handler is None:
                result = {'success': False, 'error': f'Unknown command: {command}'}
            else:
                result = handler(params)

        except json.JSONDecodeError as e:
            result = {'success': False, 'error': f'Invalid JSON: {str(e)}'}
        except Exception as e:
            result = {'success': False, 'error': str(e)}

        sys.stdout.write(json.dumps(result) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
