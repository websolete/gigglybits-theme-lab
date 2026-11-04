// The theme builder lives in media/themeBuilder.js, so the Theme Lab webview loads the same
// code the build script and the extension host run. This file keeps the old require path.
module.exports = require('../media/themeBuilder.js');
