# Music Streaming Player 🎵

A WebUI for playing music from video URLs (YouTube, etc.) using yt-dlp with real-time waveform visualization.

## Features

- 🎧 Stream audio from YouTube and other video platforms
- 📊 Real-time waveform visualization using WebSocket
- 🎨 Beautiful, responsive UI
- ⚡ Fast audio extraction using yt-dlp

## Architecture

```
music/
├── backend/          # FastAPI backend
│   ├── main.py       # Main API application
│   └── requirements.txt
├── frontend/         # Static web frontend
│   ├── index.html    # Main HTML file
│   ├── style.css     # Styles
│   └── app.js        # JavaScript application
└── README.md
```

## Prerequisites

- Python 3.9+
- FFmpeg (for audio processing)
- yt-dlp (installed via requirements)

## Installation

### Backend

```bash
cd backend
pip install -r requirements.txt
```

### FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Running the Application

### Start the Backend

```bash
cd backend
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Serve the Frontend

Using Python's built-in server:
```bash
cd frontend
python -m http.server 3000
```

Then open http://localhost:3000 in your browser.

## API Endpoints

### REST Endpoints

- `GET /` - API information
- `GET /info?url=<video_url>` - Get track information (title, duration)
- `GET /stream?url=<video_url>` - Stream audio as MP3

### WebSocket Endpoints

- `WS /ws/waveform?url=<video_url>` - Real-time waveform data (amplitude values)

## Usage

1. Start the backend server
2. Open the frontend in a browser
3. Paste a YouTube or video URL in the input field
4. Click "Play" to start streaming

## Technologies

- **Backend:** FastAPI, yt-dlp, FFmpeg
- **Frontend:** Vanilla HTML/CSS/JavaScript, Canvas API
- **Communication:** REST API, WebSocket

## License

MIT
