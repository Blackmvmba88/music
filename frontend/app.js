// Configuration
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`;

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'ws://localhost:8000'
    : `${WS_PROTOCOL}//${window.location.hostname}:8000`;

// URL validation pattern (optimized - compiled once)
const URL_PATTERN = /^https?:\/\/(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/?|[/?]\S+)$/i;

/**
 * Validate URL format before sending to backend.
 * This optimized validation prevents unnecessary API calls on invalid URLs.
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is valid, false otherwise
 */
function validateUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    url = url.trim();
    
    // Quick length check
    if (url.length < 10 || url.length > 2048) {
        return false;
    }
    
    // Use pre-compiled regex for performance
    if (!URL_PATTERN.test(url)) {
        return false;
    }
    
    // Additional validation using URL constructor
    try {
        const parsed = new URL(url);
        // Must have http or https protocol
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
    } catch {
        return false;
    }
    
    return true;
}

// DOM Elements
const urlInput = document.getElementById('url-input');
const playBtn = document.getElementById('play-btn');
const audioPlayer = document.getElementById('audio-player');
const waveformCanvas = document.getElementById('waveform-canvas');
const trackTitle = document.getElementById('track-title');
const volumeSlider = document.getElementById('volume-slider');

// Canvas setup
const ctx = waveformCanvas.getContext('2d');
let amplitudes = [];
const MAX_AMPLITUDES = 100;

// WebSocket connection
let ws = null;
let isPlaying = false;

// Initialize canvas size
function resizeCanvas() {
    const container = waveformCanvas.parentElement;
    waveformCanvas.width = container.clientWidth - 40;
    waveformCanvas.height = 150;
    drawWaveform();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Draw waveform visualization
function drawWaveform() {
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    const centerY = height / 2;
    
    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    if (amplitudes.length === 0) {
        // Draw idle state
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        
        // Draw "waiting" text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for audio...', width / 2, centerY);
        return;
    }
    
    const barWidth = width / MAX_AMPLITUDES;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.5, '#e94560');
    gradient.addColorStop(1, '#ff6b6b');
    
    ctx.fillStyle = gradient;
    
    for (let i = 0; i < amplitudes.length; i++) {
        const amplitude = amplitudes[i];
        const barHeight = amplitude * (height - 20);
        const x = i * barWidth;
        const y = centerY - barHeight / 2;
        
        // Draw bar with rounded corners (with fallback for older browsers)
        const radius = Math.min(barWidth / 4, 3);
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x + 1, y, barWidth - 2, barHeight, radius);
        } else {
            // Fallback for browsers without roundRect support
            ctx.rect(x + 1, y, barWidth - 2, barHeight);
        }
        ctx.fill();
    }
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
}

// Animation loop for smooth waveform
function animateWaveform() {
    drawWaveform();
    if (isPlaying) {
        requestAnimationFrame(animateWaveform);
    }
}

// Connect to WebSocket for waveform data
function connectWaveformWS(videoUrl) {
    if (ws) {
        ws.close();
    }
    
    const wsUrl = `${WS_URL}/ws/waveform?url=${encodeURIComponent(videoUrl)}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'amplitude') {
            amplitudes.push(data.value);
            if (amplitudes.length > MAX_AMPLITUDES) {
                amplitudes.shift();
            }
        } else if (data.type === 'complete') {
            console.log('Waveform stream complete');
        } else if (data.type === 'error') {
            console.error('Waveform error:', data.message);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket closed');
    };
}

// Fetch track info
async function fetchTrackInfo(videoUrl) {
    try {
        const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(videoUrl)}`);
        const data = await response.json();
        if (data.title) {
            trackTitle.textContent = data.title;
        }
        return data;
    } catch (error) {
        console.error('Error fetching track info:', error);
        return null;
    }
}

// Play audio
async function playAudio() {
    const videoUrl = urlInput.value.trim();
    
    if (!videoUrl) {
        alert('Please enter a video URL');
        return;
    }
    
    // Validate URL before making API calls (optimized - avoids unnecessary requests)
    if (!validateUrl(videoUrl)) {
        alert('Please enter a valid URL (must start with http:// or https://)');
        return;
    }
    
    // Update UI
    playBtn.disabled = true;
    playBtn.classList.add('loading');
    playBtn.innerHTML = '<span class="play-icon">⏳</span> Loading...';
    trackTitle.textContent = 'Loading...';
    amplitudes = [];
    
    try {
        // Fetch track info
        await fetchTrackInfo(videoUrl);
        
        // Set audio source
        const streamUrl = `${BACKEND_URL}/stream?url=${encodeURIComponent(videoUrl)}`;
        audioPlayer.src = streamUrl;
        audioPlayer.volume = volumeSlider.value / 100;
        
        // Connect WebSocket for waveform
        connectWaveformWS(videoUrl);
        
        // Play audio
        await audioPlayer.play();
        
        isPlaying = true;
        playBtn.innerHTML = '<span class="play-icon">⏸</span> Pause';
        playBtn.disabled = false;
        playBtn.classList.remove('loading');
        
        // Start waveform animation
        animateWaveform();
        
    } catch (error) {
        console.error('Error playing audio:', error);
        trackTitle.textContent = 'Error loading track';
        playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
        playBtn.disabled = false;
        playBtn.classList.remove('loading');
    }
}

// Pause audio
function pauseAudio() {
    audioPlayer.pause();
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
}

// Toggle play/pause
function togglePlayPause() {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
}

// Event listeners
playBtn.addEventListener('click', togglePlayPause);

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (!isPlaying) {
            playAudio();
        }
    }
});

volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = volumeSlider.value / 100;
});

audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
    if (ws) {
        ws.close();
    }
});

audioPlayer.addEventListener('error', (e) => {
    console.error('Audio error:', e);
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
    playBtn.disabled = false;
    playBtn.classList.remove('loading');
    trackTitle.textContent = 'Error loading audio';
});

// Initial draw
drawWaveform();
