const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add import
if (!content.includes('import VirtualList')) {
  content = content.replace(
    "import { useState", 
    "import VirtualList from './components/VirtualList'\nimport { useState"
  );
  console.log('Added VirtualList import');
}

// 2. Virtualize filteredTracks
const targetMap = `filteredTracks.map(track => <TrackRow key={track.id} track={track} onCancel={handleCancelTrack} onGoToLibrary={goToLibraryTrack} />)`;
const replacementMap = `<VirtualList
                items={filteredTracks}
                estimateSize={61}
                className="w-full h-full min-h-[500px]"
                renderItem={(track) => (
                  <TrackRow key={track.id} track={track} onCancel={handleCancelTrack} onGoToLibrary={goToLibraryTrack} />
                )}
              />`;
              
if (content.includes(targetMap)) {
  content = content.replace(targetMap, replacementMap);
  console.log('Replaced filteredTracks.map with VirtualList');
} else {
  console.log('Error: Could not find targetMap in App.jsx');
}

// 3. Let's also virtualize the flat library table (Join view)
// At line ~2841: return finalList.map((f, i) => {
// Since the join view is more complex (has sticky headers inside the map), 
// we'll leave it for Etapa 2 to avoid breaking the sticky headers logic right now.

fs.writeFileSync(appPath, content, 'utf8');
console.log('Finished stage 1 refactor');
