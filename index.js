// This is a proxy entry point to help Render find the compiled code
try {
  require('./dist/index.js');
} catch (err) {
  console.error("Failed to load ./dist/index.js. Checking directory structure...");
  const fs = require('fs');
  const path = require('path');
  
  const listDir = (dir) => {
    try {
      console.log(`Contents of ${dir}:`, fs.readdirSync(dir));
    } catch (e) {
      console.error(`Could not read ${dir}:`, e.message);
    }
  };

  listDir(__dirname);
  listDir(path.join(__dirname, 'dist'));
  
  throw err;
}
