[README.md](https://github.com/user-attachments/files/23486856/README.md)
# Sentiment Aura

A real-time audio transcription and sentiment visualization application that transforms spoken words into a beautiful, generative art display powered by Perlin noise.

## Overview

Sentiment Aura captures audio input, transcribes it in real-time using Deepgram's API, analyzes sentiment and extracts keywords using OpenAI, and visualizes the results as a dynamic, color-coded aura that responds to emotional content.

## Architecture

The application consists of three main components:

1. **Frontend (React)**: Captures audio, manages WebSocket connections, displays UI, and renders the Perlin noise visualization
2. **Backend (FastAPI)**: Receives transcribed text and proxies requests to OpenAI API for sentiment analysis
3. **External APIs**:
   - Deepgram: Real-time audio transcription via WebSocket
   - OpenAI: Sentiment analysis and keyword extraction

## Features

- Real-time audio transcription using Deepgram WebSocket API
- AI-powered sentiment analysis (0-1 scale) and keyword extraction
- Dynamic Perlin noise visualization that responds to sentiment
- Smooth animations and transitions
- Auto-scrolling transcript display
- Animated keyword tag cloud
- Modern, polished UI with glassmorphism effects

## Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- Deepgram API key (sign up at [deepgram.com](https://deepgram.com) - $200 free credits)
- OpenAI API key (sign up at [openai.com](https://openai.com))

## Setup

### Quick Start

Run the setup script:

```bash
chmod +x setup.sh
./setup.sh
```

### Manual Setup

#### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file from example:
```bash
cp .env.example .env
```

5. Edit `.env` and add your API keys:
```
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
API_PORT=8000
```

#### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from example:
```bash
cp .env.example .env
```

4. Edit `.env` and add your backend URL:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```

**Note:** The Deepgram API key is now stored in `backend/.env` (DEEPGRAM_API_KEY). The frontend connects through the backend WebSocket proxy, so it doesn't need the API key directly.

## Running the Application

### Start the Backend

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python main.py
```

The backend will run on `http://localhost:8000`

### Start the Frontend

In a new terminal:

```bash
cd frontend
npm start
```

The frontend will open in your browser at `http://localhost:3000`

## Usage

1. Click the "Start" button to begin recording
2. Grant microphone permissions when prompted
3. Start speaking - your words will appear in the transcript
4. The visualization will update in real-time based on sentiment
5. Keywords will fade in as they are detected
6. Click "Stop" to end recording

## Data Flow

1. User clicks "Start" → Frontend requests microphone access
2. Frontend connects to backend WebSocket proxy (`/ws/deepgram`)
3. Backend WebSocket proxy connects to Deepgram API with proper Authorization headers
4. Audio streams from frontend → backend proxy → Deepgram API
5. Deepgram returns transcription in real-time via backend proxy → frontend
6. When a final transcript is received, frontend sends it to backend `/process_text`
7. Backend calls OpenAI API for sentiment analysis
8. Backend returns structured JSON: `{sentiment, keywords, emotion}`
9. Frontend updates visualization parameters based on sentiment
10. Perlin noise visualization smoothly interpolates to new parameters

**Note:** The WebSocket proxy is necessary because browsers cannot set custom headers (like `Authorization`) on WebSocket connections. The backend handles Deepgram authentication securely.

## Visualization Details

The Perlin noise visualization maps sentiment data to visual parameters:

- **Color Hue**: Blue/cyan (negative) → Yellow (neutral) → Red/orange (positive)
- **Intensity**: Saturation and brightness increase with sentiment extremity
- **Noise Scale**: More chaotic patterns for extreme emotions
- **Flow Strength**: Stronger particle flow for higher sentiment
- **Particle Count**: More particles for higher energy levels

All parameters smoothly interpolate between updates for fluid transitions.

## Error Handling

The application includes robust error handling for:
- Microphone access failures
- WebSocket disconnections
- API timeouts
- Backend connection issues
- Invalid API responses

## Project Structure

```
sentiment-aura/
├─ README.md
├─ QUICKSTART.md
├─ setup.sh
├─ backend/
│  ├─ main.py
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ .env               # (gitignored)
└─ frontend/
   ├─ public/index.html
   ├─ src/
   │  ├─ index.js
   │  ├─ index.css
   │  ├─ App.js / App.css
   │  └─ components/
   │     ├─ AuraVisualization.js
   │     ├─ TranscriptDisplay.js / TranscriptDisplay.css
   │     ├─ KeywordsDisplay.js / KeywordsDisplay.css
   │     └─ Controls.js / Controls.css
   ├─ package.json
   ├─ .env.example
   └─ .env               # (gitignored)
```

## Troubleshooting

### Microphone not working
- Check browser permissions
- Ensure HTTPS or localhost (required for microphone access)
- Try a different browser

### Backend connection errors
- Verify backend is running on port 8000
- Check `REACT_APP_BACKEND_URL` in frontend `.env`
- Ensure CORS is properly configured

### API errors
- Verify API keys are correct in `.env` files
- Check API quotas and credits
- Review browser console and backend logs for detailed errors

## License

MIT

