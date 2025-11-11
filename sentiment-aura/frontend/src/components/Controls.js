import React from 'react';
import './Controls.css';

const Controls = ({ isRecording, onStart, onStop, isProcessing }) => {
  return (
    <div className="controls">
      <button
        className={`control-button ${isRecording ? 'recording' : ''}`}
        onClick={isRecording ? onStop : onStart}
        disabled={isProcessing && !isRecording}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        aria-pressed={isRecording}
      >
        <span className="button-icon">
          {isRecording ? (
            <span className="stop-icon">■</span>
          ) : (
            <span className="play-icon">▶</span>
          )}
        </span>
        <span className="button-text">
          {isRecording ? 'Stop' : 'Start'}
        </span>
        {isRecording && (
          <span className="recording-indicator">
            <span className="pulse-dot"></span>
          </span>
        )}
      </button>
      {isProcessing && (
        <div className="processing-indicator" role="status" aria-live="polite">
          Processing sentiment...
        </div>
      )}
    </div>
  );
};

export default Controls;

