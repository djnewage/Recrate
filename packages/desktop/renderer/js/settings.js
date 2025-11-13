const { electronAPI } = window;

// Load config on init
async function loadConfig() {
  try {
    const config = await electronAPI.getConfig();
    document.getElementById('serato-path').value = config.seratoPath;
    document.getElementById('music-path').value = config.musicPath;
    document.getElementById('port').value = config.port;
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Select Serato path
async function selectSeratoPath() {
  const path = await electronAPI.selectDirectory('Select Serato Library Folder');
  if (path) {
    document.getElementById('serato-path').value = path;
  }
}

// Select music path
async function selectMusicPath() {
  const path = await electronAPI.selectDirectory('Select Music Folder');
  if (path) {
    document.getElementById('music-path').value = path;
  }
}

// Save settings
document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const config = {
    seratoPath: document.getElementById('serato-path').value,
    musicPath: document.getElementById('music-path').value,
    port: parseInt(document.getElementById('port').value),
    autoStart: true
  };

  try {
    await electronAPI.saveConfig(config);
    alert('Settings saved! Restart the server for changes to take effect.');
    closeSettings();
  } catch (error) {
    alert('Failed to save settings: ' + error.message);
  }
});

// Close settings window
function closeSettings() {
  window.close();
}

// Initialize
loadConfig();
