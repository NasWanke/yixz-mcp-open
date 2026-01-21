const { exec } = require('child_process');

function openURL(url) {
    return new Promise<void>((resolve, reject) => {
        let command;

        switch (process.platform) {
            case 'win32': // Windows
                command = `start "" "${url}"`; // 兼容含空格的 URL
                break;
            case 'darwin': // macOS
                command = `open "${url}"`;
                break;
            case 'linux': // Linux
                command = `xdg-open "${url}"`;
                break;
            default:
                reject(new Error(`Unsupported platform: ${process.platform}`));
                return;
        }

        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function encodeBase64 (string: string) {
  if (typeof Buffer !== 'undefined') {
    // Node.js 环境
    return Buffer.from(string, 'utf-8').toString('base64')
  } else {
    // 浏览器环境
    return btoa(
      encodeURIComponent(string).replace(/%([0-9A-F]{2})/g, (_, p1) => {
        return String.fromCharCode(parseInt('0x' + p1, 16))
      })
    )
  }
}

export const createCursorLink = (name: string, args: any = {}) => {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${name}&config=${encodeBase64(
    JSON.stringify(args)
  )}`
}

export const openCursorLink = (name: string, args: any = {}) => {
  openURL(createCursorLink(name, args))
}
