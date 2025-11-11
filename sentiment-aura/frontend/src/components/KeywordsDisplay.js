import React, { useEffect, useState } from 'react';
import './KeywordsDisplay.css';

const KeywordsDisplay = ({ keywords }) => {
  const [displayedKeywords, setDisplayedKeywords] = useState([]);

  useEffect(() => {
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('KeywordsDisplay: Received keywords:', keywords);
    }
    
    // Track all timeouts for proper cleanup
    const timeoutIds = [];
    
    if (!keywords || keywords.length === 0) {
      // Fade out existing keywords gracefully
      setDisplayedKeywords(prev => 
        prev.map(k => ({ ...k, isRemoving: true }))
      );
      const fadeTimeout = setTimeout(() => {
        setDisplayedKeywords([]);
      }, 500);
      timeoutIds.push(fadeTimeout);
      
      // Cleanup on unmount
      return () => {
        timeoutIds.forEach(id => clearTimeout(id));
      };
    }

    // Animate keywords appearing one by one with floating up effect
    // Vary stagger delay based on keyword count - faster for many keywords
    const staggerDelay = keywords.length > 5 ? 150 : 250;
    keywords.forEach((keyword, index) => {
      const timeoutId = setTimeout(() => {
        setDisplayedKeywords(prev => {
          // Check if keyword already exists to avoid duplicates
          const existing = prev.find(k => k.text === keyword);
          if (existing) {
            // Update existing keyword to re-animate
            return prev.map(k => 
              k.text === keyword ? { ...k, isNew: true, isRemoving: false } : k
            );
          }
          // Add new keyword with floating animation
          return [...prev, { 
            text: keyword, 
            id: Date.now() + index,
            isNew: true,
            isRemoving: false
          }];
        });
      }, index * staggerDelay);
      timeoutIds.push(timeoutId);
    });

    // Cleanup old keywords that are no longer in the list
    // Wait for all new keywords to appear first
    const cleanupDelay = keywords.length * staggerDelay + 300;
    const cleanupTimer = setTimeout(() => {
      setDisplayedKeywords(prev => {
        const toKeep = prev.filter(k => keywords.includes(k.text));
        const toRemove = prev.filter(k => !keywords.includes(k.text));
        
        if (toRemove.length === 0) {
          // No keywords to remove, just mark existing ones as no longer new
          return toKeep.map(k => ({ ...k, isNew: false }));
        }
        
        // Mark removed keywords for fade-out
        const marked = toRemove.map(k => ({ ...k, isRemoving: true }));
        
        // Remove after animation
        const removeTimeout = setTimeout(() => {
          setDisplayedKeywords(prev => prev.filter(k => keywords.includes(k.text)));
        }, 400);
        timeoutIds.push(removeTimeout);
        
        return [...toKeep.map(k => ({ ...k, isNew: false })), ...marked];
      });
    }, cleanupDelay);
    timeoutIds.push(cleanupTimer);
    
    // Cleanup all timers on unmount or keywords change
    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [keywords]);

  if (displayedKeywords.length === 0) {
    return (
      <div className="keywords-display">
        <div className="keywords-header">Keywords</div>
        <div className="keywords-placeholder">Keywords will appear here...</div>
      </div>
    );
  }

  return (
    <div className="keywords-display">
      <div className="keywords-header">Keywords</div>
      <div className="keywords-container">
        {displayedKeywords.map((keywordObj, index) => (
          <span
            key={keywordObj.id}
            className={`keyword-tag ${keywordObj.isNew ? 'keyword-enter' : ''} ${keywordObj.isRemoving ? 'keyword-exit' : ''}`}
            style={{
              animationDelay: keywordObj.isNew ? `${index * 0.15}s` : '0s'
            }}
          >
            {keywordObj.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default KeywordsDisplay;

