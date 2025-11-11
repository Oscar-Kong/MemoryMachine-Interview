import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import AuraVisualization from './components/AuraVisualization';
import TranscriptDisplay from './components/TranscriptDisplay';
import KeywordsDisplay from './components/KeywordsDisplay';
import Controls from './components/Controls';
import SentimentIndicator from './components/SentimentIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const WS_BACKEND_URL = BACKEND_URL.replace('http://', 'ws://').replace('https://', 'wss://');

// Log backend URL for debugging (development only)
if (process.env.NODE_ENV === 'development') {
  console.log('Backend URL configured:', BACKEND_URL);
  console.log('WebSocket URL configured:', WS_BACKEND_URL);
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sentiment, setSentiment] = useState(0.5);
  const [keywords, setKeywords] = useState([]);
  const [emotion, setEmotion] = useState('neutral');
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Component mount logging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('App component mounted');
    }
  }, []);

  const websocketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const isRecordingRef = useRef(false);

  const stopRecording = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('stopRecording called, isRecordingRef:', isRecordingRef.current);
    }
    
    // Immediately update state to prevent further recording
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsProcessing(false); // Also stop processing state so button is enabled

    // Stop Web Audio API processor immediately
    if (mediaRecorderRef.current) {
      try {
        const audioData = mediaRecorderRef.current;
        
        // Immediately clear the audio processing handler
        if (audioData.processor) {
          audioData.processor.onaudioprocess = null; // Stop processing first
          try {
            audioData.processor.disconnect();
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Processor already disconnected');
            }
          }
        }
        
        // Disconnect source
        if (audioData.source) {
          try {
            audioData.source.disconnect();
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Source already disconnected');
            }
          }
        }
        
        // Close audio context
        if (audioData.audioContext) {
          const audioContext = audioData.audioContext;
          // Immediately suspend to stop all audio processing
          if (audioContext.state !== 'closed' && audioContext.state !== 'suspended') {
            audioContext.suspend().catch(err => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Error suspending audio context:', err);
              }
            });
          }
          // Then close it
          if (audioContext.state !== 'closed') {
            audioContext.close().catch(err => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Error closing audio context:', err);
              }
            });
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error stopping audio processor:', err);
        }
      }
      mediaRecorderRef.current = null;
    }

    // Stop media stream tracks immediately
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
          if (process.env.NODE_ENV === 'development') {
            console.log('Stopped track:', track.kind, 'state:', track.readyState);
          }
        });
        mediaStreamRef.current = null;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error stopping media stream:', err);
        }
      }
    }

    // Don't close WebSocket - keep it open for next session
    // The backend will keep the connection alive
    if (process.env.NODE_ENV === 'development') {
      console.log('Recording stopped, WebSocket kept open for next session');
    }
  }, []);

  const processText = useCallback(async (text) => {
    if (!text || !text.trim() || isProcessing) {
      return;
    }

    // Add visual indicator when processing is slow (>500ms)
    const processingTimeout = setTimeout(() => {
      setIsProcessing(true);
    }, 500);

    try {
      const response = await axios.post(
        `${BACKEND_URL}/process_text`,
        { text: text },
        { timeout: 15000 }
      );

      // Clear timeout when response arrives
      clearTimeout(processingTimeout);

      if (response.data) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Received response from backend:', response.data);
          console.log('Keywords in response:', response.data.keywords);
        }
        setSentiment(response.data.sentiment || 0.5);
        setKeywords(response.data.keywords || []);
        setEmotion(response.data.emotion || 'neutral');
        if (process.env.NODE_ENV === 'development') {
          console.log('Set keywords state to:', response.data.keywords || []);
        }
        setIsProcessing(false);
      }
    } catch (err) {
      // Clear timeout on error
      clearTimeout(processingTimeout);
      if (process.env.NODE_ENV === 'development') {
        console.error('Error processing text:', err);
      }
      if (err.code === 'ECONNABORTED') {
        setError('Backend request timed out. The AI service may be slow.');
      } else if (err.response) {
        const errorDetail = err.response.data?.detail || 'Unknown error';
        // Check for quota errors - backend should handle with fallback, but show warning
        if (errorDetail.includes('quota') || errorDetail.includes('429') || errorDetail.includes('rate limit')) {
          setError('OpenAI API quota exceeded. Using fallback analysis. Keywords may be limited.');
        } else {
          setError(`Backend error: ${errorDetail}`);
        }
      } else {
        setError('Failed to connect to backend. Please ensure it is running.');
      }
      setIsProcessing(false);
    }
  }, [isProcessing]);


  // WebSocket message handler
  const handleWebSocketMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle Deepgram Results
      if (data.type === 'Results' || data.channel) {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final || false;
        
        if (transcript && transcript.trim()) {
          if (isFinal) {
            // Final results - update transcript and process
            setTranscript(prev => {
              const cleanPrev = prev.replace(/\[.*?\]/g, '').trim();
              return cleanPrev + (cleanPrev ? ' ' : '') + transcript;
            });
            // Send to backend for sentiment analysis
            processText(transcript);
          } else {
            // Interim results - show immediately for faster feedback
            setTranscript(prev => {
              const cleanPrev = prev.replace(/\[.*?\]/g, '').trim();
              return cleanPrev + (cleanPrev ? ' ' : '') + `[${transcript}]`;
            });
          }
        }
      }
      // Handle errors from backend
      else if (data.type === 'Error') {
        if (process.env.NODE_ENV === 'development') {
          console.error('Backend/Deepgram error:', data.message);
        }
        setError(`Transcription error: ${data.message}`);
        if (isRecordingRef.current) {
          stopRecording();
        }
      }
      // Handle metadata
      else if (data.type === 'Metadata') {
        if (process.env.NODE_ENV === 'development') {
          console.log('Deepgram metadata:', data);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error processing WebSocket message:', err);
      }
    }
  }, [processText, stopRecording]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Get or create WebSocket connection to backend proxy
      let ws = websocketRef.current;
      const needsNewConnection = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      
      if (needsNewConnection) {
        const wsUrl = `${WS_BACKEND_URL}/ws/deepgram`;
        if (process.env.NODE_ENV === 'development') {
          console.log('Connecting to backend WebSocket proxy:', wsUrl);
        }
        ws = new WebSocket(wsUrl);
        websocketRef.current = ws;
        
        ws.onopen = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log('Connected to backend WebSocket proxy (Deepgram)');
          }
        };

        ws.onmessage = handleWebSocketMessage;

        ws.onerror = (error) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('WebSocket error:', error);
          }
          setError('WebSocket connection error. Please ensure backend is running.');
          if (isRecordingRef.current) {
            stopRecording();
          }
        };

        ws.onclose = (event) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('WebSocket closed:', event.code, event.reason);
          }
          // Only update state if we were actually recording
          if (isRecordingRef.current) {
            isRecordingRef.current = false;
            setIsRecording(false);
            if (event.code !== 1000) { // 1000 = normal closure
              setError('Connection to transcription service lost.');
            }
          }
          // Clear the ref so we reconnect on next start
          websocketRef.current = null;
        };
      } else {
        // Reusing existing connection - make sure handlers are set
        if (process.env.NODE_ENV === 'development') {
          console.log('Reusing existing WebSocket connection (state:', ws.readyState, ')');
        }
        ws.onmessage = handleWebSocketMessage;
      }
      
      // Make sure we're using the current WebSocket reference
      ws = websocketRef.current;
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      mediaStreamRef.current = stream;

      // Use Web Audio API to convert to PCM16 (linear16) for Deepgram
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const currentWs = websocketRef.current;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          // Get PCM16 audio data (16-bit signed integers)
          const inputData = event.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          
          // Convert float32 (-1.0 to 1.0) to int16 (-32768 to 32767)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Send PCM16 data to WebSocket
          currentWs.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store processor for cleanup
      mediaRecorderRef.current = { processor, audioContext, source };

      // Wait for WebSocket to be open before starting recording
      if (ws.readyState === WebSocket.CONNECTING) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('WebSocket connection timeout'));
          }, 5000);
          
          const originalOnOpen = ws.onopen;
          ws.onopen = (event) => {
            clearTimeout(timeout);
            if (originalOnOpen) originalOnOpen(event);
            resolve();
          };
          
          const originalOnError = ws.onerror;
          ws.onerror = (error) => {
            clearTimeout(timeout);
            if (originalOnError) originalOnError(error);
            reject(error);
          };
        });
      } else if (ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket is not in a valid state for recording (state: ${ws.readyState}). Please try again.`);
      }
      
      // Web Audio API processor is already set up and will start processing automatically
      // No need to call start() like with MediaRecorder
      
      // Set recording state
      isRecordingRef.current = true;
      setIsRecording(true);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Recording started with backend WebSocket proxy');
      }

    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error starting recording:', err);
      }
      setError(err.message || 'Failed to start recording. Please check microphone permissions.');
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [handleWebSocketMessage, stopRecording]);

  // Cleanup on unmount - close WebSocket only when component unmounts
  useEffect(() => {
    return () => {
      // Close WebSocket only when component is unmounting
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      // Clean up audio resources
      stopRecording();
    };
  }, [stopRecording]);

  return (
    <div className="App">
      <AuraVisualization 
        sentiment={sentiment}
        emotion={emotion}
        keywords={keywords}
        transcript={transcript}
      />
      <TranscriptDisplay transcript={transcript} emotion={emotion} />
      <KeywordsDisplay keywords={keywords} />
      <SentimentIndicator sentiment={sentiment} />
      <Controls 
        isRecording={isRecording}
        onStart={startRecording}
        onStop={stopRecording}
        isProcessing={isProcessing}
      />
      {error && (
        <div className="error-message" role="alert" aria-live="assertive">
          {error}
          <button 
            onClick={() => setError(null)}
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

