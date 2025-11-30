import asyncio
import subprocess
import struct
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import yt_dlp

app = FastAPI(title="Music Streaming API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_audio_url(video_url: str) -> Optional[str]:
    """Extract direct audio URL from video URL using yt-dlp."""
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return info.get("url")
    except Exception as e:
        print(f"Error extracting audio URL: {e}")
        return None


def get_audio_info(video_url: str) -> Optional[dict]:
    """Get audio info including title and duration."""
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return {
                "title": info.get("title", "Unknown"),
                "duration": info.get("duration", 0),
                "url": info.get("url"),
            }
    except Exception as e:
        print(f"Error getting audio info: {e}")
        return None


async def stream_audio_generator(audio_url: str):
    """Stream audio using ffmpeg to convert to mp3."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-i", audio_url,
        "-f", "mp3",
        "-acodec", "libmp3lame",
        "-ab", "192k",
        "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    
    try:
        while True:
            chunk = await process.stdout.read(8192)
            if not chunk:
                break
            yield chunk
    finally:
        process.kill()
        await process.wait()


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Music Streaming API", "version": "1.0.0"}


@app.get("/info")
async def get_info(url: str = Query(..., description="Video URL")):
    """Get audio info from URL."""
    info = get_audio_info(url)
    if not info:
        return {"error": "Could not extract audio info"}
    return info


@app.get("/stream")
async def stream_audio(url: str = Query(..., description="Video URL")):
    """Stream audio from URL."""
    audio_url = get_audio_url(url)
    if not audio_url:
        return {"error": "Could not extract audio URL"}
    
    return StreamingResponse(
        stream_audio_generator(audio_url),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
        }
    )


class WaveformGenerator:
    """Generate waveform data from audio stream."""
    
    def __init__(self, sample_rate: int = 44100, channels: int = 2):
        self.sample_rate = sample_rate
        self.channels = channels
        self.samples_per_chunk = 1024
    
    async def generate_amplitudes(self, audio_url: str, websocket: WebSocket):
        """Stream PCM data and send amplitudes via WebSocket."""
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i", audio_url,
            "-f", "s16le",  # PCM 16-bit little-endian
            "-acodec", "pcm_s16le",
            "-ar", str(self.sample_rate),
            "-ac", str(self.channels),
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        
        try:
            bytes_per_sample = 2 * self.channels
            chunk_size = self.samples_per_chunk * bytes_per_sample
            
            while True:
                pcm_data = await process.stdout.read(chunk_size)
                if not pcm_data:
                    break
                
                # Calculate amplitude from PCM data
                samples = struct.unpack(f"<{len(pcm_data) // 2}h", pcm_data)
                
                # Calculate RMS amplitude
                if samples:
                    rms = sum(s * s for s in samples) / len(samples)
                    amplitude = (rms ** 0.5) / 32768.0  # Normalize to 0-1
                    
                    await websocket.send_json({
                        "type": "amplitude",
                        "value": min(amplitude * 2, 1.0),  # Scale for visibility
                    })
                
                await asyncio.sleep(0.02)  # ~50 updates per second
                
        except Exception as e:
            print(f"Error generating waveform: {e}")
        finally:
            process.kill()
            await process.wait()


@app.websocket("/ws/waveform")
async def websocket_waveform(websocket: WebSocket, url: str = Query(...)):
    """WebSocket endpoint for real-time waveform data."""
    await websocket.accept()
    
    audio_url = get_audio_url(url)
    if not audio_url:
        await websocket.send_json({"type": "error", "message": "Could not extract audio URL"})
        await websocket.close()
        return
    
    await websocket.send_json({"type": "connected", "message": "Waveform stream ready"})
    
    generator = WaveformGenerator()
    
    try:
        await generator.generate_amplitudes(audio_url, websocket)
        await websocket.send_json({"type": "complete"})
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
