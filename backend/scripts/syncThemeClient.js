// The theme studio runs the same colour checks in the browser as on the server. This copies utils/theme/color.js into the frontend as an ES module.
// Run after changing backend/utils/theme/color.js:  node backend/scripts/syncThemeClient.js   (the smoke test fails if the copy is stale)
const fs = require('fs'); const path = require('path');
const src = path.join(__dirname, '..', 'utils', 'theme', 'color.js'); const dst = path.join(__dirname, '..', '..', 'frontend', 'src', 'theme');
const header = '// GENERATED from backend/utils/theme/color.js by backend/scripts/syncThemeClient.js. Edit the backend file, then run the script.\n';
const build = () => ({ 'color.js': header + fs.readFileSync(src, 'utf8').replace(/module\.exports = \{([^}]+)\};/, (m, n) => `export { ${n.trim()} };`) });
if (require.main === module) { fs.mkdirSync(dst, { recursive: true }); for (const [n, c] of Object.entries(build())) fs.writeFileSync(path.join(dst, n), c); console.log('synced', Object.keys(build()).join(', ')); }
module.exports = { build, dst };
