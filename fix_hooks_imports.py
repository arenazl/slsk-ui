import glob

files = glob.glob('src/components/ui/*.jsx')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if "import React from 'react';" in content:
        content = content.replace(
            "import React from 'react';", 
            "import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';"
        )
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
            
print("Fixed hooks imports in UI components")
