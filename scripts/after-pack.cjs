const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const identifier = context.packager.appInfo.id;

  console.log(`[after-pack] ad-hoc signing ${appPath} with identifier ${identifier}`);
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--identifier', identifier, appPath],
    { stdio: 'inherit' },
  );
  execFileSync('codesign', ['-dv', appPath], { stdio: 'inherit' });
};
