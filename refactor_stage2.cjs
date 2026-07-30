const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Memoize TrackRow
const trackRowStart = `function TrackRow({ track, onCancel, onGoToLibrary }) {`;
const trackRowReplacement = `const TrackRow = React.memo(function TrackRow({ track, onCancel, onGoToLibrary }) {`;

if (content.includes(trackRowStart) && !content.includes('const TrackRow = React.memo')) {
  content = content.replace(trackRowStart, trackRowReplacement);
  
  // Find the end of TrackRow function to close the memo
  const trackRowEnd = `  )\n}`;
  const trackRowEndReplacement = `  )\n}, (prev, next) => {
  return prev.track.id === next.track.id && 
         prev.track.status === next.track.status && 
         prev.track.progress === next.track.progress &&
         prev.track.format === next.track.format;
});`;
  
  // Only replace the first match which corresponds to TrackRow
  // A safer way is to regex replace the exact ending of TrackRow.
  // The function is around line 462. We can use a regex that matches the end of TrackRow.
  content = content.replace(/(\s+<\/div>\n  \)\n})/, `$1, (prev, next) => {
  return prev.track.id === next.track.id && 
         prev.track.status === next.track.status && 
         prev.track.progress === next.track.progress;
});`);
  console.log('Memoized TrackRow');
} else {
  console.log('TrackRow already memoized or not found');
}

// 2. Memoize GenreCard
const genreCardStart = `function GenreCard({ genre, files, onDrop, onOpenFolder, onDownloadZip, color, colorRgb, expanded, onToggle, playingFile, onPlay, onContextMenu }) {`;
const genreCardReplacement = `const GenreCard = React.memo(function GenreCard({ genre, files, onDrop, onOpenFolder, onDownloadZip, color, colorRgb, expanded, onToggle, playingFile, onPlay, onContextMenu }) {`;

if (content.includes(genreCardStart) && !content.includes('const GenreCard = React.memo')) {
  content = content.replace(genreCardStart, genreCardReplacement);
  
  content = content.replace(/(Arrastrá archivos aquí\n            <\/div>\n          \)}\n        <\/div>\n      \)}\n    <\/div>\n  \)\n})/, `$1, (prev, next) => {
  const prevHasPlaying = prev.files.some(f => f.filename === prev.playingFile);
  const nextHasPlaying = next.files.some(f => f.filename === next.playingFile);
  return prev.expanded === next.expanded &&
         prev.files.length === next.files.length &&
         prev.genre === next.genre &&
         prevHasPlaying === nextHasPlaying &&
         prev.playingFile === next.playingFile; 
});`);
  console.log('Memoized GenreCard');
} else {
  console.log('GenreCard already memoized or not found');
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('Finished stage 2 refactor');
