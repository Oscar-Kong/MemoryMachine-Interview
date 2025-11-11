import React, { useEffect, useRef } from 'react';
import './TranscriptDisplay.css';

const TranscriptDisplay = ({ transcript, emotion = 'neutral' }) => {
  const transcriptRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new text arrives
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Map emotion to color theme
  const getEmotionColor = (emotion) => {
    const colorMap = {
      'happy': { primary: '#FFD700', secondary: '#FFA500', glow: 'rgba(255, 215, 0, 0.4)' },
      'sad': { primary: '#4A90E2', secondary: '#5B9BD5', glow: 'rgba(74, 144, 226, 0.4)' },
      'angry': { primary: '#FF4444', secondary: '#FF6B6B', glow: 'rgba(255, 68, 68, 0.4)' },
      'fearful': { primary: '#9B59B6', secondary: '#8E44AD', glow: 'rgba(155, 89, 182, 0.4)' },
      'surprised': { primary: '#FF69B4', secondary: '#FF1493', glow: 'rgba(255, 105, 180, 0.4)' },
      'disgusted': { primary: '#2ECC71', secondary: '#27AE60', glow: 'rgba(46, 204, 113, 0.4)' },
      'neutral': { primary: '#FFFFFF', secondary: '#E0E0E0', glow: 'rgba(255, 255, 255, 0.3)' },
    };
    return colorMap[emotion.toLowerCase()] || colorMap['neutral'];
  };

  const colors = getEmotionColor(emotion);

  // Process transcript to highlight interim results (text in brackets)
  const renderTranscript = () => {
    if (!transcript) {
      return <span className="transcript-placeholder">Start speaking to see your transcript here...</span>;
    }
    
    // Split text and highlight interim results in brackets
    const parts = transcript.split(/(\[.*?\])/g);
    return parts.map((part, index) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return (
          <span key={index} className="transcript-interim">
            {part.slice(1, -1)}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="transcript-display" style={{ '--emotion-primary': colors.primary, '--emotion-secondary': colors.secondary, '--emotion-glow': colors.glow }}>
      <div className="transcript-header">
        <span className="transcript-label">Live Transcript</span>
        <span className="transcript-emotion">{emotion}</span>
      </div>
      <div className="transcript-content" ref={transcriptRef}>
        {renderTranscript()}
      </div>
    </div>
  );
};

export default TranscriptDisplay;

