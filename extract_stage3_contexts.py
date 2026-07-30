import os

app_path = os.path.join('src', 'App.jsx')
toast_path = os.path.join('src', 'contexts', 'ToastContext.jsx')
confirm_path = os.path.join('src', 'contexts', 'ConfirmContext.jsx')

with open(app_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Extract Toast (Lines 5 to 76 is index 4 to 75)
toast_lines = lines[4:76]
toast_code = "import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';\n\n" + "".join(toast_lines).replace("const useToast", "export const useToast").replace("function ToastProvider", "export function ToastProvider")

# Extract Confirm (Lines 78 to 109 is index 77 to 108)
confirm_lines = lines[77:109]
confirm_code = "import React, { createContext, useState, useCallback, useContext } from 'react';\n\n" + "".join(confirm_lines).replace("const useConfirm", "export const useConfirm").replace("function ConfirmProvider", "export function ConfirmProvider")

# Remove them from App.jsx and insert imports
new_lines = lines[:4] + [
    "import { ToastProvider, useToast } from './contexts/ToastContext';\n",
    "import { ConfirmProvider, useConfirm } from './contexts/ConfirmContext';\n"
] + lines[109:]

# Write new files
with open(toast_path, 'w', encoding='utf-8') as f:
    f.write(toast_code)

with open(confirm_path, 'w', encoding='utf-8') as f:
    f.write(confirm_code)

with open(app_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Extracted ToastContext and ConfirmContext")
