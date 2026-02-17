def extract_all(path, output_dir, key=None, filter_type=None):
    if not unrpa:
        return {"success": False, "error": "unrpa library not installed"}
    
    try:
        key_int = 0
        if key:
            try:
                key_int = int(key, 0)
            except ValueError:
                return {"success": False, "error": "Invalid key format"}
        
        extracted_count = 0
        with open(path, 'rb') as f:
            archive = unrpa.ArchiveView(f, key=key_int)
            
            # Identify files to extract
            files_to_extract = []
            for filename in archive.files.keys():
                # Apply filter if specified
                if filter_type == "video":
                     if not filename.lower().endswith(('.webm', '.mkv', '.avi', '.mp4', '.ogv')):
                         continue
                files_to_extract.append(filename)
            
            # Extract them
            for filename in files_to_extract:
                try:
                    data = archive.read(filename)
                    out_path = os.path.join(output_dir, filename)
                    os.makedirs(os.path.dirname(out_path), exist_ok=True)
                    with open(out_path, 'wb') as out_f:
                        out_f.write(data)
                    extracted_count += 1
                except Exception as ex:
                    print(f"Error extracting {filename}: {ex}", file=sys.stderr)
                    # Continue with other files even if one fails
            
            return {"success": True, "outputDir": output_dir, "extractedCount": extracted_count}

    except Exception as e:
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}
