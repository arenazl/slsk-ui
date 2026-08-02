import os
import sys

def extract_view(filepath, view_name, dest_dir):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    start_idx = -1
    for i, line in enumerate(lines):
        if line.startswith(f"function {view_name}(") or line.startswith(f"const {view_name} ="):
            start_idx = i
            break
            
    if start_idx == -1:
        print(f"Could not find {view_name}")
        return
        
    brace_count = 0
    end_idx = start_idx
    started = False
    
    for i in range(start_idx, len(lines)):
        brace_count += lines[i].count('{')
        brace_count -= lines[i].count('}')
        if '{' in lines[i]:
            started = True
            
        if started and brace_count == 0:
            end_idx = i
            break
            
    view_lines = lines[start_idx:end_idx+1]
    
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        
    view_path = os.path.join(dest_dir, f"{view_name}.jsx")
    
    with open(view_path, 'w', encoding='utf-8') as f:
        f.write("import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';\n")
        f.write("import PlayPauseBtn from '../components/ui/PlayPauseBtn';\n")
        f.write("import SearchingLabel from '../components/ui/SearchingLabel';\n")
        f.write("import SkeletonRows from '../components/ui/SkeletonRows';\n")
        f.write("import StarFilterHover from '../components/ui/StarFilterHover';\n")
        f.write("import StarRating from '../components/ui/StarRating';\n")
        f.write("import TrackThumb from '../components/ui/TrackThumb';\n")
        f.write("import GenreCombo from '../components/ui/GenreCombo';\n")
        f.write("import { useToast } from '../contexts/ToastContext';\n")
        f.write("import { useConfirm } from '../contexts/ConfirmContext';\n\n")
        
        # Write the function, changing to export default
        for line in view_lines:
            if line.startswith(f"function {view_name}("):
                f.write(line.replace(f"function {view_name}(", f"export default function {view_name}("))
            elif line.startswith(f"const {view_name} ="):
                f.write(line.replace(f"const {view_name} =", f"export default "))
            else:
                f.write(line)
                
    # Now remove from App.jsx and add import
    new_lines = []
    import_added = False
    
    for i in range(len(lines)):
        if i >= start_idx and i <= end_idx:
            continue
            
        if not import_added and line.startswith("import "):
            new_lines.append(f"import {view_name} from './views/{view_name}';\n")
            import_added = True
            
        new_lines.append(lines[i])
        
    if not import_added:
        new_lines.insert(0, f"import {view_name} from './views/{view_name}';\n")
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print(f"Extracted {view_name} successfully")

extract_view('src/App.jsx', 'Library', 'src/views')
