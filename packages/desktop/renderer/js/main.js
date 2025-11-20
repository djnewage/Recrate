console.log('🚀 SCRIPT LOADING - main.js started');

// Prevent double-loading
if (window.recrateMainLoaded) {
  console.warn('main.js already loaded, skipping...');
  throw new Error('Script already loaded');
}
window.recrateMainLoaded = true;
console.log('✓ Script initialized, checking for electronAPI...');

// Verify preload script loaded correctly
if (!window.electronAPI) {
  console.error('FATAL: electronAPI not available! Preload script failed.');
  const loadingState = document.getElementById('loading-state');
  if (loadingState) {
    loadingState.textContent = 'ERROR: Failed to connect to Electron. Please restart the app.';
    loadingState.style.color = '#f56565';
  }
  throw new Error('electronAPI not available');
}

const electronAPI = window.electronAPI;
console.log('✓ electronAPI loaded successfully');

let serverStatus = 'stopped';
let serverURL = '';
let connectionType = 'local';

// Initialize
async function init() {
  // Set initial UI to stopped state
  const loadingState = document.getElementById('loading-state');
  const toggleBtn = document.getElementById('toggle-btn');
  loadingState.textContent = 'Checking server status...';
  toggleBtn.className = 'btn-secondary';
  toggleBtn.innerHTML = '<span>⏳</span><span>Loading...</span>';
  toggleBtn.disabled = true;

  // CRITICAL: Register listener BEFORE checking status to avoid race condition
  console.log('📡 Registering server status listener...');
  electronAPI.onServerStatus((status) => {
    console.log('📨 Received server status event:', status);
    serverStatus = status.status;
    serverURL = status.url || status.localURL;
    updateUI(status);

    if (status.status === 'running') {
      loadStats();
    }
  });

  // Register proxy status listener
  console.log('📡 Registering proxy status listener...');
  electronAPI.onProxyStatus((proxyStatus) => {
    console.log('📨 Received proxy status event:', proxyStatus);
    // Refresh connection info when proxy status changes
    if (serverStatus === 'running') {
      updateConnectionInfo({ proxyURL: proxyStatus.url });
    }
  });

  // Now check initial status
  await updateServerStatus();

  // Re-enable button
  toggleBtn.disabled = false;

  // Poll for status updates every 2 seconds (like old version)
  setInterval(() => {
    updateServerStatus();
  }, 2000);

  // Update stats periodically
  setInterval(() => {
    if (serverStatus === 'running') {
      loadStats();
    }
  }, 30000); // Every 30 seconds
}

// Update server status
async function updateServerStatus() {
  console.log('📡 updateServerStatus called');
  try {
    console.log('🔍 Verifying electronAPI.getServerStatus exists...');
    if (typeof electronAPI.getServerStatus !== 'function') {
      throw new Error('electronAPI.getServerStatus is not a function');
    }

    console.log('📞 Calling electronAPI.getServerStatus()...');

    // Add timeout to prevent infinite waiting
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Status check timeout after 5 seconds')), 5000)
    );

    const status = await Promise.race([
      electronAPI.getServerStatus(),
      timeoutPromise
    ]);

    console.log('✅ Server status received:', JSON.stringify(status, null, 2));
    serverStatus = status.status;
    serverURL = status.url || status.localURL;
    console.log(`📊 Status: ${serverStatus}, URL: ${serverURL}`);

    await updateUI(status);

    if (status.status === 'running') {
      console.log('🎵 Server running, loading stats...');
      loadStats();
    }
  } catch (error) {
    console.error('❌ Failed to get server status:', error);
    console.error('Error stack:', error.stack);
    // Set to stopped on error
    serverStatus = 'stopped';
    await updateUI({ status: 'stopped' });
  }
}

// Update UI based on status
async function updateUI(statusData) {
  const badge = document.getElementById('status-badge');
  const qrSection = document.getElementById('qr-section');
  const statsSection = document.getElementById('stats-section');
  const loadingState = document.getElementById('loading-state');
  const toggleBtn = document.getElementById('toggle-btn');

  if (serverStatus === 'running') {
    // Update badge
    badge.className = 'status-badge';
    badge.innerHTML = '<span>✅</span><span>Running</span>';

    // Show content
    qrSection.classList.remove('hidden');
    statsSection.classList.remove('hidden');
    loadingState.classList.add('hidden');

    // Update button
    toggleBtn.className = 'btn-danger';
    toggleBtn.innerHTML = '<span>⏹</span><span>Stop</span>';

    // Update connection info
    await updateConnectionInfo(statusData);

  } else {
    // Update badge
    badge.className = 'status-badge stopped';
    badge.innerHTML = '<span>⭕</span><span>Stopped</span>';

    // Hide content
    qrSection.classList.add('hidden');
    statsSection.classList.add('hidden');
    loadingState.classList.remove('hidden');
    loadingState.textContent = 'Server stopped';

    // Update button
    toggleBtn.className = 'btn-primary';
    toggleBtn.innerHTML = '<span>▶️</span><span>Start</span>';
  }
}

// Update connection info and QR code
async function updateConnectionInfo(statusData) {
  if (!serverURL && !statusData) return;

  const urlElement = document.getElementById('connection-url');
  const iconElement = document.getElementById('connection-icon');
  const labelElement = document.getElementById('connection-label');

  // Get proxy status and Tailscale info
  const proxyStatus = await electronAPI.getProxyStatus();
  const tailscaleInfo = await electronAPI.getTailscaleInfo();

  let displayURL = serverURL;

  // Determine connection type - prioritize: Proxy > Tailscale > Local
  if (proxyStatus.connected && proxyStatus.url) {
    // Cloud proxy is the best option - works everywhere
    displayURL = proxyStatus.url;
    connectionType = 'proxy';

    urlElement.textContent = displayURL;
    iconElement.textContent = '☁️';
    labelElement.textContent = 'Cloud Proxy • Works anywhere';
  } else if (tailscaleInfo.running && tailscaleInfo.ip) {
    // Tailscale as fallback
    displayURL = statusData?.tailscaleURL || `http://${tailscaleInfo.ip}:3000`;
    connectionType = 'tailscale';

    urlElement.textContent = displayURL;
    iconElement.textContent = '🌐';
    labelElement.textContent = 'Tailscale Remote • Tap to copy';
  } else {
    // Local network only
    displayURL = statusData?.localURL || serverURL;
    connectionType = 'local';

    urlElement.textContent = displayURL;
    iconElement.textContent = '🏠';
    labelElement.textContent = 'Local Network • Same WiFi only';
  }

  // Generate QR code
  generateQR(displayURL);
}

// Generate QR code
function generateQR(url) {
  const canvas = document.getElementById('qr-code');
  if (!canvas) return;

  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const size = 160; // Smaller than before
  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      ctx.fillStyle = qr.isDark(row, col) ? '#000000' : '#ffffff';
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
}

// Load library stats
async function loadStats() {
  try {
    if (!serverURL) return;

    // Fetch library data from server
    const response = await fetch(`${serverURL}/api/stats`);
    const stats = await response.json();

    // Update stats display
    document.getElementById('stat-tracks').textContent =
      `• ${stats.trackCount || 0} tracks`;
    document.getElementById('stat-crates').textContent =
      `• ${stats.crateCount || 0} crates`;
    document.getElementById('stat-updated').textContent =
      `• Updated ${getTimeAgo(stats.lastUpdate)}`;

  } catch (error) {
    console.error('Failed to load stats:', error);
    document.getElementById('stat-tracks').textContent = '• Unable to load';
    document.getElementById('stat-crates').textContent = '• Check connection';
    document.getElementById('stat-updated').textContent = '• ---';
  }
}

// Helper: Format time ago
function getTimeAgo(timestamp) {
  if (!timestamp) return 'just now';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// Copy URL to clipboard
function copyURL() {
  const url = document.getElementById('connection-url').textContent;

  navigator.clipboard.writeText(url).then(() => {
    // Show feedback
    const urlElement = document.getElementById('connection-url');
    const originalText = urlElement.textContent;
    urlElement.textContent = '✅ Copied!';

    setTimeout(() => {
      urlElement.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

// Toggle server
async function toggleServer() {
  if (serverStatus === 'running') {
    await electronAPI.stopServer();
  } else {
    await electronAPI.startServer();
  }

  // Update UI immediately (before server responds)
  document.getElementById('loading-state').textContent =
    serverStatus === 'running' ? 'Stopping server...' : 'Starting server...';

  // Wait a bit then check status
  setTimeout(updateServerStatus, 1000);
}

// Open settings window
function openSettings() {
  electronAPI.openSettings();
}

// Initialize on load with DOM ready check
if (document.readyState === 'loading') {
  console.log('Waiting for DOM to be ready...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, initializing...');
    init();
  });
} else {
  console.log('DOM already ready, initializing immediately...');
  init();
}
