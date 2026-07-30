import os

def extract_functions(filepath, func_names, dest_dir):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    extracted = {}
    new_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        match_name = None
        for fn in func_names:
            if line.startswith(f"function {fn}(") or line.startswith(f"const {fn} ="):
                match_name = fn
                break
        
        if match_name:
            # count braces
            brace_count = 0
            start_i = i
            end_i = i
            started = False
            for j in range(i, len(lines)):
                brace_count += lines[j].count('{')
                brace_count -= lines[j].count('}')
                if '{' in lines[j]:
                    started = True
                if started and brace_count == 0:
                    end_i = j
                    break
            
            # extract block
            func_lines = lines[start_i:end_i+1]
            extracted[match_name] = "".join(func_lines)
            
            # Insert import statement if not already there
            new_lines.append(f"import {match_name} from './components/ui/{match_name}';\n")
            
            i = end_i + 1
        else:
            # avoid pushing duplicates if they run multiple times
            if not any(f"import {fn} from './components/ui/{fn}'" in line for fn in func_names):
                new_lines.append(line)
            i += 1
            
    # Write components
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        
    for name, code in extracted.items():
        comp_path = os.path.join(dest_dir, f"{name}.jsx")
        with open(comp_path, 'w', encoding='utf-8') as f:
            f.write("import React from 'react';\n\n")
            if code.startswith("const "):
                f.write(f"export {code}")
            else:
                f.write(code.replace(f"function {name}", f"export default function {name}"))
            
    # Update App.jsx
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print(f"Extracted {list(extracted.keys())}")

extract_functions('src/App.jsx', ['SearchingLabel', 'PlayPauseBtn', 'SkeletonRows', 'TrackThumb', 'StarRating', 'StarFilterHover'], 'src/components/ui')
