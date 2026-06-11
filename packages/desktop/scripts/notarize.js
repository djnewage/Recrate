const { notarize } = require('@electron/notarize');
const path = require('path');

// Hard cap on how long we wait for Apple's notary service before giving up.
// Apple's notarytool waits indefinitely, which has wedged CI for hours when the
// notary service is backed up. Override with NOTARIZE_TIMEOUT_MIN.
const NOTARIZE_TIMEOUT_MIN = parseInt(process.env.NOTARIZE_TIMEOUT_MIN, 10) || 30;

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not macOS');
    return;
  }

  // Explicit opt-out: ship a signed-but-not-notarized build (right-click → Open
  // on first launch). Useful when Apple's notary service is down.
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZE=true');
    return;
  }

  // Skip if no credentials provided
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization - no credentials provided');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);
  console.log(`This may take several minutes (timeout: ${NOTARIZE_TIMEOUT_MIN} min)...`);

  const timeoutMs = NOTARIZE_TIMEOUT_MIN * 60 * 1000;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Notarization timed out after ${NOTARIZE_TIMEOUT_MIN} min (Apple notary service may be backed up)`)),
      timeoutMs
    );
  });

  try {
    await Promise.race([
      notarize({
        tool: 'notarytool',
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: '5FABU4A8CA',
      }),
      timeout,
    ]);
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
