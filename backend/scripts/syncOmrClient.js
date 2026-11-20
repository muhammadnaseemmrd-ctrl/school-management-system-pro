// The phone scanner uses the same layout and image-reading code as the server. This copies them into the frontend as ES modules.
// Run after changing backend/utils/omr/layout.js or vision.js:  node backend/scripts/syncOmrClient.js   (the smoke test fails if the copies are stale)
const fs = require('fs'); const path = require('path');
const src = path.join(__dirname, '..', 'utils', 'omr'); const dst = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'omr');
const header = '// GENERATED from backend/utils/omr by backend/scripts/syncOmrClient.js. Edit the backend file, then run the script.\n';
function convert(name) {
  let s = fs.readFileSync(path.join(src, name), 'utf8');
  s = s.replace(/const \{([^}]+)\} = require\('\.\/layout'\);/, "import { $1 } from './layout.js';");
  s = s.replace(/module\.exports = \{([^}]+)\};/, (m, names) => `export { ${names.trim()} };`);
  return header + s;
}
const build = () => ({ 'layout.js': convert('layout.js'), 'vision.js': convert('vision.js') });
if (require.main === module) { fs.mkdirSync(dst, { recursive: true }); for (const [n, c] of Object.entries(build())) fs.writeFileSync(path.join(dst, n), c); console.log('synced', Object.keys(build()).join(', ')); }
module.exports = { build, dst };
