/**
 * Expo config plugin to fix Firebase compatibility issues
 * Handles modular headers, build settings, and native initialization
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withFirebaseFix = (config) => {
  // First pass: fix Podfile
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');

        // Check if the fix is already applied
        if (podfileContent.includes('use_modular_headers!')) {
          return config;
        }

        // Add use_modular_headers! after platform line
        // This is required for Firebase Swift pods
        const platformPattern = /(platform :ios,[^\n]+)/;
        if (podfileContent.match(platformPattern)) {
          podfileContent = podfileContent.replace(
            platformPattern,
            '$1\n\n# Required for Firebase Swift pods\nuse_modular_headers!'
          );
        }

        // Add build settings fix in post_install
        const firebaseFix = `

    # Firebase Compatibility Fix
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end`;

        // Find pattern: end of post_install block
        const endPattern = /(\s+end\s*\nend\s*)$/;

        if (podfileContent.match(endPattern) && !podfileContent.includes('# Firebase Compatibility Fix')) {
          podfileContent = podfileContent.replace(endPattern, firebaseFix + '$1');
        }

        fs.writeFileSync(podfilePath, podfileContent);
      }

      return config;
    },
  ]);

  // Second pass: add [FIRApp configure] to AppDelegate
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegateDir = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName);
      const appDelegatePath = path.join(appDelegateDir, 'AppDelegate.mm');

      if (!fs.existsSync(appDelegatePath)) {
        console.warn('[withFirebaseFix] AppDelegate.mm not found at', appDelegatePath);
        return config;
      }

      let contents = fs.readFileSync(appDelegatePath, 'utf8');

      // Skip if already configured
      if (contents.includes('[FIRApp configure]')) {
        return config;
      }

      // Add #import <Firebase.h> after the last #import
      const lastImportMatch = contents.match(/^(#import .+)$/m);
      if (lastImportMatch) {
        const lastImportIndex = contents.lastIndexOf('#import');
        const lineEnd = contents.indexOf('\n', lastImportIndex);
        contents =
          contents.slice(0, lineEnd + 1) +
          '#import <Firebase.h>\n' +
          contents.slice(lineEnd + 1);
      }

      // Add [FIRApp configure] at the start of didFinishLaunchingWithOptions
      const didFinishPattern = /(didFinishLaunchingWithOptions[\s\S]*?\{)/;
      if (contents.match(didFinishPattern)) {
        contents = contents.replace(
          didFinishPattern,
          '$1\n  [FIRApp configure];'
        );
      }

      fs.writeFileSync(appDelegatePath, contents);
      return config;
    },
  ]);

  return config;
};

module.exports = withFirebaseFix;
