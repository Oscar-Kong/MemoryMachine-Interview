import React from 'react';
import './SentimentIndicator.css';

const SentimentIndicator = ({ sentiment }) => {
  // Format sentiment as decimal value (0-1) with 2 decimal places
  const sentimentValue = sentiment.toFixed(2);
  
  // Get color based on sentiment
  const getSentimentColor = () => {
    if (sentiment < 0.3) return '#FF4444'; // Red for negative
    if (sentiment < 0.4) return '#FF6B6B'; // Light red
    if (sentiment < 0.6) return '#FFD700'; // Yellow/gold for neutral
    if (sentiment < 0.7) return '#4CAF50'; // Light green
    return '#2ECC71'; // Green for positive
  };

  const color = getSentimentColor();

  return (
    <div className="sentiment-indicator" style={{ '--sentiment-color': color }}>
      <span className="sentiment-number">{sentimentValue}</span>
    </div>
  );
};

export default SentimentIndicator;

