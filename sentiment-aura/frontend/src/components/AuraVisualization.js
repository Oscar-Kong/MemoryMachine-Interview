import React, { useEffect, useRef } from 'react';
import Sketch from 'react-p5';
import './AuraVisualization.css';

const AuraVisualization = ({ sentiment, emotion, keywords = [], transcript = '' }) => {
  const targetParams = useRef({
    hue: 200,
    saturation: 80,
    brightness: 60,
    noiseScale: 0.02,
    noiseSpeed: 0.01,
    particleCount: 150,
    flowStrength: 0.5,
    waveAmplitude: 0,
    keywordCount: 0,
    transcriptLength: 0,
    backgroundColor: { r: 0, g: 0, b: 0 }, // Black background by default
    particleColor: { r: 255, g: 255, b: 255 } // White particles by default
  });

  const currentParams = useRef({ ...targetParams.current });
  const particlesRef = useRef([]);
  const timeRef = useRef(0);

  // Update target parameters based on sentiment, keywords, and transcript
  useEffect(() => {
    // Map sentiment (0-1) to color hue
    // 0 (negative) = blue/cyan, 0.5 (neutral) = yellow/green, 1 (positive) = red/orange
    const baseHue = sentiment < 0.5 
      ? 200 + (sentiment * 60) // Blue to cyan/green
      : 260 + ((sentiment - 0.5) * 100); // Green to yellow to red

    // Keywords influence: More keywords = more vibrant colors
    const keywordIntensity = Math.min(keywords.length / 5, 1); // Normalize to 0-1
    const keywordHueShift = keywordIntensity * 20; // Shift hue based on keyword count
    
    // Transcript length influence: Longer transcripts = more dynamic
    const transcriptLength = transcript.length;
    const transcriptInfluence = Math.min(transcriptLength / 500, 1); // Normalize to 0-1
    
    // Combine influences
    const hue = (baseHue + keywordHueShift) % 360;

    // Intensity affects saturation and brightness
    const baseIntensity = Math.abs(sentiment - 0.5) * 2; // 0 to 1
    const keywordBoost = keywordIntensity * 0.3; // Keywords add intensity
    const intensity = Math.min(baseIntensity + keywordBoost, 1);
    
    const saturation = 40 + (intensity * 60) + (keywordIntensity * 20); // 40-120 (can exceed 100 for vibrancy)
    const brightness = 30 + (intensity * 50) + (transcriptInfluence * 20); // 30-100

    // Determine if sentiment is neutral (used for noise scale and background color)
    const isNeutral = sentiment >= 0.4 && sentiment <= 0.6;

    // Noise scale - more chaotic for extreme emotions and when keywords are present
    // Make extreme emotions MORE chaotic with wider range
    const chaosBoost = keywordIntensity * 0.01; // Keywords add chaos
    const noiseScale = isNeutral 
      ? 0.002 + chaosBoost // Calmer for neutral
      : (0.003 + Math.abs(sentiment - 0.5) * 0.015) + chaosBoost; // Wider range for extreme emotions (0.003-0.018)

    // Noise speed - faster for higher sentiment and transcript activity
    const speedBoost = transcriptInfluence * 0.005; // Active transcription speeds up
    const noiseSpeed = 0.005 + (sentiment * 0.02) + speedBoost; // 0.005-0.03

    // Particle count - more particles for higher energy and keywords
    // Reduced for cleaner look, but still dynamic
    const particleBoost = keywordIntensity * 30; // Keywords add particles
    const particleCount = 80 + (sentiment * 120) + particleBoost; // 80-230 (reduced from 100-350)

    // Flow strength - stronger flow for higher sentiment and active transcription
    const flowBoost = transcriptInfluence * 0.2; // Active transcription strengthens flow
    const flowStrength = 0.3 + (sentiment * 0.7) + flowBoost; // 0.3-1.2

    // Wave pattern: Keywords create wave-like disturbances
    const waveAmplitude = keywordIntensity * 0.3; // How much keywords affect flow

    // Background color based on sentiment (Iteration 2 style)
    // Neutral (0.4-0.6) = white background
    // Positive (>0.6) = orange background
    // Negative (<0.4) = red background
    let backgroundColor, particleColor;
    const isPositive = sentiment > 0.6;
    
    if (isNeutral) {
      // Neutral: White background with dark particles (Iteration 2 style)
      backgroundColor = { r: 255, g: 255, b: 255 }; // White background
      particleColor = { r: 0, g: 0, b: 0 }; // Black/dark particles
    } else if (isPositive) {
      // Positive: Orange background with lighter orange/yellow particles
      // Orange RGB: (255, 165, 0) - darken for background
      const orangeIntensity = (sentiment - 0.6) / 0.4; // 0 to 1
      backgroundColor = {
        r: Math.round(20 + orangeIntensity * 35), // 20-55 (dark orange)
        g: Math.round(10 + orangeIntensity * 20), // 10-30
        b: Math.round(0 + orangeIntensity * 5) // 0-5
      };
      // Lighter orange/yellow particles
      particleColor = {
        r: Math.round(255 - (1 - orangeIntensity) * 50), // 205-255
        g: Math.round(180 + orangeIntensity * 50), // 180-230
        b: Math.round(50 + orangeIntensity * 100) // 50-150
      };
    } else {
      // Negative: Red background with lighter red/pink particles
      // Red RGB: (255, 0, 0) - darken for background
      const redIntensity = (0.4 - sentiment) / 0.4; // 0 to 1
      backgroundColor = {
        r: Math.round(20 + redIntensity * 35), // 20-55 (dark red)
        g: Math.round(0 + redIntensity * 10), // 0-10
        b: Math.round(0 + redIntensity * 5) // 0-5
      };
      // Lighter red/pink particles
      particleColor = {
        r: Math.round(255 - (1 - redIntensity) * 50), // 205-255
        g: Math.round(50 + redIntensity * 100), // 50-150
        b: Math.round(50 + redIntensity * 100) // 50-150
      };
    }

    targetParams.current = {
      hue,
      saturation: Math.min(saturation, 100), // Clamp saturation to valid range
      brightness: Math.min(brightness, 100), // Clamp brightness to valid range
      noiseScale,
      noiseSpeed,
      particleSpeed: noiseSpeed,
      particleCount: Math.floor(particleCount),
      flowStrength: Math.min(flowStrength, 1.5), // Allow slightly higher flow
      waveAmplitude,
      keywordCount: keywords.length,
      transcriptLength: transcriptLength,
      backgroundColor,
      particleColor
    };
  }, [sentiment, emotion, keywords, transcript]);

  const setup = (p5, canvasParentRef) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('AuraVisualization: Setting up canvas', p5.windowWidth, p5.windowHeight, canvasParentRef);
    }
    try {
      // react-p5 passes the parent element directly, not a ref
      const canvas = p5.createCanvas(p5.windowWidth, p5.windowHeight);
      if (canvasParentRef) {
        canvas.parent(canvasParentRef);
        if (process.env.NODE_ENV === 'development') {
          console.log('AuraVisualization: Canvas attached to parent');
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn('AuraVisualization: No parent ref, canvas created but not attached');
        }
      }
      p5.colorMode(p5.HSB, 360, 100, 100, 1);
      
      // Fill with initial background color
      p5.push();
      p5.colorMode(p5.RGB, 255);
      const bg = currentParams.current.backgroundColor || { r: 0, g: 0, b: 0 };
      p5.background(bg.r, bg.g, bg.b);
      p5.pop();
      p5.colorMode(p5.HSB, 360, 100, 100, 1);
      
      // Initialize particles
      particlesRef.current = [];
      const count = Math.floor(currentParams.current.particleCount);
      if (process.env.NODE_ENV === 'development') {
        console.log(`AuraVisualization: Initializing ${count} particles`);
      }
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: p5.random(p5.width),
          y: p5.random(p5.height),
          vx: 0,
          vy: 0,
          life: p5.random(1),
          prevX: p5.random(p5.width),
          prevY: p5.random(p5.height),
          speed: 0
        });
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('AuraVisualization: Setup complete, particles:', particlesRef.current.length);
        console.log('AuraVisualization: Canvas element:', canvas);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('AuraVisualization: Setup error', error);
      }
    }
  };

  const draw = (p5) => {
    // Ensure canvas is ready
    if (!p5) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('AuraVisualization: p5 not available in draw');
      }
      return;
    }
    
    // Initialize particles if they don't exist (fallback)
    if (particlesRef.current.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('AuraVisualization: No particles, initializing...');
      }
      const count = Math.floor(currentParams.current.particleCount);
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: p5.random(p5.width),
          y: p5.random(p5.height),
          vx: 0,
          vy: 0,
          life: p5.random(1),
          prevX: p5.random(p5.width),
          prevY: p5.random(p5.height),
          speed: 0
        });
      }
    }
    
    // Smooth interpolation towards target parameters
    const lerpSpeed = 0.05;
    currentParams.current.hue = p5.lerp(
      currentParams.current.hue,
      targetParams.current.hue,
      lerpSpeed
    );
    currentParams.current.saturation = p5.lerp(
      currentParams.current.saturation,
      targetParams.current.saturation,
      lerpSpeed
    );
    currentParams.current.brightness = p5.lerp(
      currentParams.current.brightness,
      targetParams.current.brightness,
      lerpSpeed
    );
    currentParams.current.noiseScale = p5.lerp(
      currentParams.current.noiseScale,
      targetParams.current.noiseScale,
      lerpSpeed
    );
    currentParams.current.noiseSpeed = p5.lerp(
      currentParams.current.noiseSpeed,
      targetParams.current.noiseSpeed,
      lerpSpeed
    );
    currentParams.current.flowStrength = p5.lerp(
      currentParams.current.flowStrength,
      targetParams.current.flowStrength,
      lerpSpeed
    );
    currentParams.current.waveAmplitude = p5.lerp(
      currentParams.current.waveAmplitude,
      targetParams.current.waveAmplitude,
      lerpSpeed
    );
    
    // Smoothly interpolate background and particle colors
    if (targetParams.current.backgroundColor) {
      currentParams.current.backgroundColor = {
        r: Math.round(p5.lerp(currentParams.current.backgroundColor.r, targetParams.current.backgroundColor.r, lerpSpeed * 2)),
        g: Math.round(p5.lerp(currentParams.current.backgroundColor.g, targetParams.current.backgroundColor.g, lerpSpeed * 2)),
        b: Math.round(p5.lerp(currentParams.current.backgroundColor.b, targetParams.current.backgroundColor.b, lerpSpeed * 2))
      };
    }
    if (targetParams.current.particleColor) {
      currentParams.current.particleColor = {
        r: Math.round(p5.lerp(currentParams.current.particleColor.r, targetParams.current.particleColor.r, lerpSpeed * 2)),
        g: Math.round(p5.lerp(currentParams.current.particleColor.g, targetParams.current.particleColor.g, lerpSpeed * 2)),
        b: Math.round(p5.lerp(currentParams.current.particleColor.b, targetParams.current.particleColor.b, lerpSpeed * 2))
      };
    }

    // Update particle count if needed
    const targetCount = targetParams.current.particleCount;
    if (particlesRef.current.length < targetCount) {
      for (let i = particlesRef.current.length; i < targetCount; i++) {
        particlesRef.current.push({
          x: p5.random(p5.width),
          y: p5.random(p5.height),
          vx: 0,
          vy: 0,
          life: p5.random(1),
          prevX: p5.random(p5.width),
          prevY: p5.random(p5.height),
          speed: 0
        });
      }
    } else if (particlesRef.current.length > targetCount) {
      particlesRef.current = particlesRef.current.slice(0, targetCount);
    }

    // Update time for noise animation
    timeRef.current += currentParams.current.noiseSpeed;

    // Update background color dynamically (Iteration 2 style)
    // This creates smooth color transitions as sentiment changes
    const bg = currentParams.current.backgroundColor || { r: 0, g: 0, b: 0 };
    
    // Semi-transparent background overlay for trailing effect (Iteration 2 style)
    // Creates smoother, more organic trails
    p5.push();
    p5.colorMode(p5.RGB, 255);
    // Use lower opacity overlay that matches background color
    // For white background (neutral), use very light overlay
    // For colored backgrounds, use matching color overlay
    const overlayAlpha = bg.r > 200 ? 20 : 25; // Lighter overlay for white background
    p5.fill(bg.r, bg.g, bg.b, overlayAlpha);
    p5.noStroke();
    p5.rect(0, 0, p5.width, p5.height);
    p5.pop();
    p5.colorMode(p5.HSB, 360, 100, 100, 1); // Restore HSB mode

    // Update and draw particles
    particlesRef.current.forEach((particle, index) => {
      // Sample Perlin noise at particle position
      const noiseX = particle.x * currentParams.current.noiseScale;
      const noiseY = particle.y * currentParams.current.noiseScale;
      let angle = p5.noise(noiseX, noiseY, timeRef.current) * p5.TWO_PI * 4;

      // Keywords create wave-like disturbances in the flow field
      if (currentParams.current.waveAmplitude > 0) {
        const waveX = Math.sin(particle.x * 0.01 + timeRef.current * 2) * currentParams.current.waveAmplitude;
        const waveY = Math.cos(particle.y * 0.01 + timeRef.current * 2) * currentParams.current.waveAmplitude;
        angle += (waveX + waveY) * 0.5;
      }

      // Transcript length creates subtle pulsing effect
      const transcriptPulse = Math.sin(timeRef.current * 0.5 + particle.x * 0.001) * 
                             (currentParams.current.transcriptLength / 1000) * 0.1;
      angle += transcriptPulse;

      // Calculate flow force
      const force = currentParams.current.flowStrength;
      particle.vx += p5.cos(angle) * force;
      particle.vy += p5.sin(angle) * force;

      // Apply damping
      particle.vx *= 0.95;
      particle.vy *= 0.95;

      // Store previous position for line drawing
      particle.prevX = particle.x;
      particle.prevY = particle.y;

      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;
      
      // Calculate speed for dynamic line thickness
      particle.speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);

      // Wrap around edges - also update prev position to prevent lines across screen
      if (particle.x < 0) {
        particle.prevX = p5.width;
        particle.x = p5.width;
      }
      if (particle.x > p5.width) {
        particle.prevX = 0;
        particle.x = 0;
      }
      if (particle.y < 0) {
        particle.prevY = p5.height;
        particle.y = p5.height;
      }
      if (particle.y > p5.height) {
        particle.prevY = 0;
        particle.y = 0;
      }

      // Update life for color variation
      particle.life += 0.005; // Slower life progression for smoother color changes
      if (particle.life > 1) particle.life = 0;

      // Only draw if particle has moved (prevents static dots)
      const distance = Math.sqrt(
        (particle.x - particle.prevX) ** 2 + 
        (particle.y - particle.prevY) ** 2
      );
      
      if (distance > 0.1) {
        // Use RGB particle color (Iteration 2 style)
        const particleRGB = currentParams.current.particleColor || { r: 255, g: 255, b: 255 };
        
        // Dynamic opacity based on speed and sentiment
        // Faster particles = more visible, slower = more transparent
        const speedFactor = Math.min(particle.speed * 2, 1);
        const baseAlpha = 0.4 + (sentiment * 0.5); // Base opacity (0.4-0.9)
        const alpha = baseAlpha * (0.6 + speedFactor * 0.4); // Speed-based opacity
        
        // Dynamic line thickness based on speed (Iteration 2 style)
        // Faster particles = thicker lines, slower = thinner
        // For white background (neutral), use thinner lines
        const isNeutral = sentiment >= 0.4 && sentiment <= 0.6;
        const isPositive = sentiment > 0.6;
        const isNegative = sentiment < 0.4;
        const minThickness = isNeutral ? 0.3 : 0.5;
        const maxThickness = isNeutral ? 1.5 : 2.5;
        const lineThickness = minThickness + (speedFactor * (maxThickness - minThickness));
        
        // Draw smooth line from previous position to current
        // Using lines instead of points creates smoother, more organic flow (Iteration 2)
        p5.strokeCap(p5.ROUND); // Round caps for smoother appearance
        p5.push();
        p5.colorMode(p5.RGB, 255);
        p5.stroke(particleRGB.r, particleRGB.g, particleRGB.b, alpha * 255);
        p5.strokeWeight(lineThickness);
        p5.line(particle.prevX, particle.prevY, particle.x, particle.y);
        p5.pop();
        p5.colorMode(p5.HSB, 360, 100, 100, 1);
        
        // Optional: Add subtle glow for particles moving fast (only for colored backgrounds)
        if (speedFactor > 0.7 && (isPositive || isNegative)) {
          p5.push();
          p5.colorMode(p5.RGB, 255);
          // Slightly brighter glow
          const glowRGB = {
            r: Math.min(particleRGB.r * 1.2, 255),
            g: Math.min(particleRGB.g * 1.2, 255),
            b: Math.min(particleRGB.b * 1.2, 255)
          };
          p5.stroke(glowRGB.r, glowRGB.g, glowRGB.b, alpha * 0.4 * 255);
          p5.strokeWeight(lineThickness * 1.5);
          p5.line(particle.prevX, particle.prevY, particle.x, particle.y);
          p5.pop();
          p5.colorMode(p5.HSB, 360, 100, 100, 1);
        }
      }
    });
  };

  const windowResized = (p5) => {
    p5.resizeCanvas(p5.windowWidth, p5.windowHeight);
    
    // Reset particles to fit new canvas
    particlesRef.current = particlesRef.current.map(particle => ({
      ...particle,
      x: p5.constrain(particle.x, 0, p5.width),
      y: p5.constrain(particle.y, 0, p5.height)
    }));
  };

  return (
    <div className="aura-visualization">
      <Sketch 
        setup={setup} 
        draw={draw} 
        windowResized={windowResized}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default AuraVisualization;

