import sys

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix TrackRow (line 463 is index 462)
# Ensure we are replacing the correct closing brace
if lines[462].strip() == '}':
    lines[462] = "}, (prev, next) => {\n  return prev.track.id === next.track.id &&\n         prev.track.status === next.track.status &&\n         prev.track.progress === next.track.progress;\n});\n"
else:
    print("Error: Line 463 is not '}'")

# Fix GenreCard
# Let's find GenreCard end line by searching backwards from 'const GENRE_COLORS'
for i, line in enumerate(lines):
    if 'const GENRE_COLORS = [' in line:
        end_idx = i - 2
        if lines[end_idx].strip() == '}':
            lines[end_idx] = "}, (prev, next) => {\n  const prevHasPlaying = prev.files.some(f => f.filename === prev.playingFile);\n  const nextHasPlaying = next.files.some(f => f.filename === next.playingFile);\n  return prev.expanded === next.expanded &&\n         prev.files.length === next.files.length &&\n         prev.genre === next.genre &&\n         prevHasPlaying === nextHasPlaying &&\n         prev.playingFile === next.playingFile;\n});\n"
        else:
            print("Error: Line $(end_idx+1) is not }")
        break

with open('src/App.jsx', 'w', encoding='utf-8', newline='') as f:
    f.writelines(lines)

print('Syntax fix applied')

