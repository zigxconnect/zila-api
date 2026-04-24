// This is a proxy entry point to help Render find the compiled code
try {
  require('./dist/index.js');
} catch (err) {
  console.error("❌ Failed to load ./dist/index.js. Performing system diagnostics...");
  const fs = require('fs');
  const path = require('path');
  
  const listDir = (dir, label) => {
    try {
      if (fs.existsSync(dir)) {
        console.log(`📂 ${label} (${dir}):`, fs.readdirSync(dir));
      } else {
        console.error(`🚫 ${label} does not exist: ${dir}`);
      }
    } catch (e) {
      console.error(`⚠️ Could not read ${label}:`, e.message);
    }
  };

  console.log("Current Working Directory:", process.cwd());
  console.log("Filename:", __filename);
  console.log("Dirname:", __dirname);

  listDir(__dirname, "Root Directory");
  listDir(path.join(__dirname, 'dist'), "Dist Folder");
  listDir(path.join(__dirname, 'src'), "Src Folder");
  
  throw err;
}
