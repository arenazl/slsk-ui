import os

play_sizes = """
const PLAY_SIZES = {
  xs: { btn: 'w-6 h-6', icon: 'w-3 h-3' },
  sm: { btn: 'w-7 h-7', icon: 'w-3 h-3' },
  md: { btn: 'w-8 h-8', icon: 'w-3.5 h-3.5' },
  lg: { btn: 'w-9 h-9', icon: 'w-4 h-4' },
}
"""

searching_messages = """
const SEARCHING_MESSAGES = [
  'Buscando...',
  'En camino...',
  'Vamos guacho',
  'Con este la rompés',
  'Rastreando la red',
  'Cazando el tema',
  'Escarbando SoulSeek',
  'Ya casi lo tengo',
  'Afilando la púa',
  'Esto va a sonar',
  'Tremendo temazo',
  'Pateando la pista',
]
"""

def prepend_to_file(filepath, text):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # insert after imports
    for i, line in enumerate(lines):
        if not line.startswith("import "):
            lines.insert(i, text + "\n")
            break
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)

prepend_to_file('src/components/ui/PlayPauseBtn.jsx', play_sizes)
prepend_to_file('src/components/ui/SearchingLabel.jsx', searching_messages)

print("Constants prepended successfully.")
