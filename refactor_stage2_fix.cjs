const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

content = content.replace("        )}\n      </div>\n    </div>\n  )\n}", `        )}\n      </div>\n    </div>\n  )\n}, (prev, next) => {
  return prev.track.id === next.track.id && 
         prev.track.status === next.track.status && 
         prev.track.progress === next.track.progress;
});`);

content = content.replace("            </div>\n          )}\n        </div>\n      )}\n    </div>\n  )\n}", `            </div>\n          )}\n        </div>\n      )}\n    </div>\n  )\n}, (prev, next) => {
  const prevHasPlaying = prev.files.some(f => f.filename === prev.playingFile);
  const nextHasPlaying = next.files.some(f => f.filename === next.playingFile);
  return prev.expanded === next.expanded &&
         prev.files.length === next.files.length &&
         prev.genre === next.genre &&
         prevHasPlaying === nextHasPlaying &&
         prev.playingFile === next.playingFile; 
});`);

fs.writeFileSync(appPath, content, 'utf8');
console.log('Fixed syntax errors');
