from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
import asyncio
import websockets
import json
import re
import httpx
import logging

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO if os.getenv("ENVIRONMENT", "development") == "production" else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Get Deepgram API key for WebSocket proxy
deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")

# CORS configuration
# Allow all localhost ports in development, restrict in production
is_production = os.getenv("ENVIRONMENT", "development") == "production"
if is_production:
    # Production: restrict to specific origins
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
    allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]
    if not allowed_origins:
        allowed_origins = ["http://localhost:3000"]  # Default fallback
else:
    # Development: allow localhost with any port
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=None if is_production else r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Note: /token endpoint removed - using WebSocket proxy instead
# This eliminates the need for token generation and simplifies the architecture

# Initialize OpenAI client lazily
_openai_client = None

def get_openai_client():
    """Get or create OpenAI client instance"""
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


class TextRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: float
    keywords: list[str]
    emotion: str


@app.post("/process_text", response_model=SentimentResponse)
async def process_text(request: TextRequest):
    """
    Process text through OpenAI API to extract sentiment and keywords.
    Returns structured JSON with sentiment score, keywords, and emotion.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    # Check if API key is configured
    try:
        get_openai_client()
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    try:
        # Construct prompt for OpenAI
        prompt = f"""Analyze the following text and return a JSON object with:
1. "sentiment": a float between 0 and 1 where 0 is very negative and 1 is very positive
2. "keywords": an array of 3-5 most important keywords or phrases from the text
3. "emotion": a single word describing the primary emotion (e.g., "positive", "negative", "neutral", "joyful", "sad", "angry", "excited", "calm")

Text: "{request.text}"

Return ONLY valid JSON in this exact format:
{{"sentiment": 0.85, "keywords": ["keyword1", "keyword2", "keyword3"], "emotion": "positive"}}"""

        # Call OpenAI API with timeout
        logger.debug(f"Attempting to call OpenAI API for text: {request.text[:50]}...")
        use_fallback = False
        response = None
        
        try:
            response = await asyncio.wait_for(
                call_openai(prompt),
                timeout=10.0
            )
            logger.info("OpenAI API call successful!")
        except asyncio.TimeoutError:
            logger.warning("OpenAI API request timed out, using fallback")
            use_fallback = True
        except Exception as e:
            error_msg = str(e)
            logger.error(f"OpenAI API error: {error_msg}")
            # Check for quota/rate limit errors
            if "quota" in error_msg.lower() or "429" in error_msg or "rate limit" in error_msg.lower() or "insufficient_quota" in error_msg.lower():
                logger.warning("OpenAI quota exceeded, using fallback analysis")
                use_fallback = True
            else:
                # For other errors, try fallback but also log the error
                logger.warning(f"OpenAI API error (non-quota), using fallback: {error_msg}")
                use_fallback = True
        
        if use_fallback:
            try:
                logger.info("Using fallback sentiment analysis")
                return fallback_sentiment_analysis(request.text)
            except Exception as fallback_error:
                logger.error(f"Fallback analysis also failed: {fallback_error}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Both OpenAI and fallback analysis failed: {str(fallback_error)}"
                )

        # Parse response
        if not response:
            raise HTTPException(
                status_code=500,
                detail="No response from OpenAI API"
            )

        # Extract JSON from response (handle both JSON and text responses)
        # json and re are already imported at the top of the file

        # Try to extract JSON object from the response
        # Look for JSON object with proper bracket matching
        json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*"sentiment"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
        json_match = re.search(json_pattern, response, re.DOTALL)
        
        if json_match:
            try:
                result = json.loads(json_match.group())
            except json.JSONDecodeError:
                # If extracted JSON is invalid, try parsing whole response
                result = json.loads(response)
        else:
            # If no JSON found, try parsing the whole response
            try:
                result = json.loads(response)
            except json.JSONDecodeError:
                # Last resort: try to find any JSON-like structure
                # Look for sentiment value directly
                sentiment_match = re.search(r'"sentiment"\s*:\s*([0-9.]+)', response)
                keywords_match = re.findall(r'"keywords"\s*:\s*\[(.*?)\]', response, re.DOTALL)
                emotion_match = re.search(r'"emotion"\s*:\s*"([^"]+)"', response)
                
                sentiment_val = float(sentiment_match.group(1)) if sentiment_match else 0.5
                emotion_val = emotion_match.group(1) if emotion_match else "neutral"
                
                # Try to extract keywords
                keywords_list = []
                if keywords_match:
                    keywords_str = keywords_match[0]
                    keyword_items = re.findall(r'"([^"]+)"', keywords_str)
                    keywords_list = keyword_items
                
                result = {
                    "sentiment": sentiment_val,
                    "keywords": keywords_list,
                    "emotion": emotion_val
                }

        # Validate and normalize response
        sentiment = float(result.get("sentiment", 0.5))
        sentiment = max(0.0, min(1.0, sentiment))  # Clamp between 0 and 1

        keywords = result.get("keywords", [])
        if not isinstance(keywords, list):
            keywords = []
        
        logger.debug(f"Processed response - sentiment: {sentiment}, keywords: {keywords}, emotion: {result.get('emotion', 'neutral')}")

        emotion = result.get("emotion", "neutral")
        if not isinstance(emotion, str):
            emotion = "neutral"

        return SentimentResponse(
            sentiment=sentiment,
            keywords=keywords[:5],  # Limit to 5 keywords
            emotion=emotion
        )

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse OpenAI response: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing text: {str(e)}"
        )


async def call_openai(prompt: str) -> str:
    """Call OpenAI API asynchronously"""
    from openai import RateLimitError, APIError
    
    loop = asyncio.get_event_loop()
    client = get_openai_client()
    
    def sync_call():
        try:
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that analyzes text sentiment and extracts keywords. Always return valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=200
            )
            return response.choices[0].message.content
        except Exception as e:
            # Catch all OpenAI errors and re-raise with context
            error_str = str(e).lower()
            error_type = type(e).__name__
            logger.error(f"OpenAI API error caught: {error_type}: {error_str}")
            # Check for quota/rate limit errors
            if "quota" in error_str or "429" in error_str or "rate limit" in error_str or "insufficient_quota" in error_str or error_type == "RateLimitError":
                raise Exception(f"OpenAI quota exceeded: {str(e)}")
            # Re-raise other errors
            raise Exception(f"OpenAI API error: {str(e)}")

    return await loop.run_in_executor(None, sync_call)


def fallback_sentiment_analysis(text: str) -> SentimentResponse:
    """
    Fallback sentiment analysis when OpenAI API is unavailable.
    Uses simple heuristics to extract sentiment, keywords, and emotion.
    """
    import re
    from collections import Counter
    
    logger.debug(f"Fallback analysis called for text: {text[:100]}...")
    text_lower = text.lower()
    
    # Enhanced sentiment analysis using positive/negative word lists with intensity
    # Strong positive words (weight 2)
    strong_positive = ['love', 'amazing', 'fantastic', 'excellent', 'wonderful', 'delighted', 'ecstatic', 'thrilled']
    # Moderate positive words (weight 1)
    moderate_positive = ['happy', 'joy', 'great', 'good', 'positive', 'excited', 'pleased', 'satisfied', 'nice', 'fine', 'okay', 'ok']
    # Strong negative words (weight 2)
    strong_negative = ['hate', 'terrible', 'awful', 'horrible', 'disgusting', 'devastated', 'miserable']
    # Moderate negative words (weight 1)
    moderate_negative = ['sad', 'angry', 'bad', 'disappointed', 'frustrated', 'upset', 'worried', 'fear', 'anxious', 'depressed', 'annoyed']
    
    # Count with weights
    positive_score = sum(2 if word in text_lower else 0 for word in strong_positive)
    positive_score += sum(1 if word in text_lower else 0 for word in moderate_positive)
    
    negative_score = sum(2 if word in text_lower else 0 for word in strong_negative)
    negative_score += sum(1 if word in text_lower else 0 for word in moderate_negative)
    
    # Check for negation (e.g., "not happy", "not good")
    negation_words = ['not', "n't", 'no', 'never', 'nothing', 'nobody', 'nowhere']
    has_negation = any(neg in text_lower for neg in negation_words)
    
    # If negation is present, flip the sentiment
    if has_negation:
        positive_score, negative_score = negative_score, positive_score
    
    # Calculate sentiment (0-1 scale) with more dynamic range
    total_score = positive_score + negative_score
    if total_score > 0:
        # Normalize to 0-1 range, with more extreme values
        sentiment = 0.5 + ((positive_score - negative_score) / max(total_score * 2, 1)) * 0.5
    else:
        # Analyze text length and punctuation for neutral sentiment
        # Longer text with questions might be more neutral
        question_marks = text.count('?')
        exclamation_marks = text.count('!')
        
        # Slight bias based on punctuation
        if exclamation_marks > question_marks:
            sentiment = 0.55  # Slightly positive (excited)
        elif question_marks > exclamation_marks:
            sentiment = 0.45  # Slightly negative (uncertain)
        else:
            sentiment = 0.5  # Truly neutral
    
    # Clamp to valid range
    sentiment = max(0.0, min(1.0, sentiment))
    
    # Extract keywords: most common significant words (excluding stop words)
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
                 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'}
    
    # Extract words (alphanumeric, at least 3 characters)
    words = re.findall(r'\b[a-z]{3,}\b', text_lower)
    # Filter out stop words and count
    significant_words = [w for w in words if w not in stop_words]
    word_counts = Counter(significant_words)
    
    # Get top 5 most common words as keywords
    keywords = [word for word, count in word_counts.most_common(5)]
    
    # Ensure we have at least some keywords even if text is short
    if len(keywords) == 0 and len(significant_words) > 0:
        # Take first few significant words if no duplicates
        keywords = list(set(significant_words))[:5]
    
    # Determine emotion based on sentiment and keywords
    if sentiment > 0.7:
        emotion = "positive"
    elif sentiment < 0.3:
        emotion = "negative"
    else:
        emotion = "neutral"
    
    # Refine emotion based on keyword presence
    if any(word in text_lower for word in ['happy', 'joy', 'excited', 'love']):
        emotion = "joyful"
    elif any(word in text_lower for word in ['sad', 'depressed', 'down']):
        emotion = "sad"
    elif any(word in text_lower for word in ['angry', 'mad', 'furious']):
        emotion = "angry"
    elif any(word in text_lower for word in ['calm', 'peaceful', 'relaxed']):
        emotion = "calm"
    
    logger.debug(f"Fallback extracted keywords: {keywords} (count: {len(keywords)})")
    logger.debug(f"Fallback calculated sentiment: {sentiment}, emotion: {emotion}")
    
    return SentimentResponse(
        sentiment=sentiment,
        keywords=keywords[:5],
        emotion=emotion
    )


@app.websocket("/ws/deepgram")
async def websocket_deepgram_proxy(websocket: WebSocket):
    """
    WebSocket proxy endpoint that connects frontend to Deepgram.
    This is needed because browsers cannot set custom headers on WebSocket connections.
    """
    await websocket.accept()
    
    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not deepgram_api_key:
        await websocket.send_text(json.dumps({
            "type": "Error",
            "message": "DEEPGRAM_API_KEY not configured on server"
        }))
        await websocket.close()
        return
    
    # Validate API key format (should be alphanumeric, no spaces)
    deepgram_api_key = deepgram_api_key.strip()
    if not deepgram_api_key or len(deepgram_api_key) < 20:
        await websocket.send_text(json.dumps({
            "type": "Error",
            "message": "DEEPGRAM_API_KEY appears to be invalid (too short or empty)"
        }))
        await websocket.close()
        return
    
    # Deepgram WebSocket URL
    # Note: Deepgram WebSocket API typically expects linear16 (PCM16) encoding
    # Browser sends webm/opus, so we'll need to handle conversion or use a different approach
    # For now, try without encoding to let Deepgram auto-detect, or use linear16 if conversion is available
    # If webm doesn't work, we may need to convert audio to PCM16 on the frontend
    deepgram_url = "wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1"
    
    try:
        # Connect to Deepgram with Authorization header
        # websockets library uses 'additional_headers' parameter
        # Deepgram expects: Authorization: Token YOUR_API_KEY
        headers = {
            "Authorization": f"Token {deepgram_api_key}"
        }
        
        print(f"Attempting to connect to Deepgram...")
        print(f"URL: {deepgram_url}")
        print(f"API key length: {len(deepgram_api_key)}")
        
        async with websockets.connect(
            deepgram_url, 
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=10
        ) as deepgram_ws:
            print("Connected to Deepgram WebSocket")
            print(f"Deepgram URL: {deepgram_url}")
            
            # Task to forward messages from Deepgram to frontend
            async def forward_from_deepgram():
                try:
                    async for message in deepgram_ws:
                        try:
                            # Deepgram sends text (JSON) messages
                            if isinstance(message, str):
                                await websocket.send_text(message)
                            else:
                                # Binary messages (unlikely from Deepgram, but handle just in case)
                                await websocket.send_bytes(message)
                        except Exception as e:
                            print(f"Error sending to frontend: {e}")
                            # Don't break - continue trying to receive from Deepgram
                            continue
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"Deepgram connection closed: {e.code} - {e.reason}")
                    # Send error message to frontend but don't close immediately
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "Error",
                            "message": f"Deepgram connection closed: {e.reason or 'Unknown reason'}"
                        }))
                    except:
                        pass
                except Exception as e:
                    print(f"Error forwarding from Deepgram: {type(e).__name__}: {e}")
                    import traceback
                    traceback.print_exc()
                # Note: Don't close frontend connection here - let forward_to_deepgram handle it
            
            # Task to forward messages from frontend to Deepgram
            async def forward_to_deepgram():
                chunk_count = 0
                try:
                    while True:
                        try:
                            # Check if WebSocket is still connected before receiving
                            # FastAPI WebSocket doesn't expose a direct state check,
                            # so we'll catch the RuntimeError instead
                            data = await websocket.receive()
                            
                            # Deepgram expects binary audio data
                            if "bytes" in data:
                                # Check if Deepgram connection is still open before sending
                                try:
                                    # Send binary data directly to Deepgram
                                    await deepgram_ws.send(data["bytes"])
                                    chunk_count += 1
                                    if chunk_count == 1:
                                        print("First audio chunk received and forwarded to Deepgram")
                                    elif chunk_count % 100 == 0:
                                        print(f"Forwarded {chunk_count} audio chunks to Deepgram")
                                except websockets.exceptions.ConnectionClosed as e:
                                    print(f"Deepgram connection closed while sending audio (chunk {chunk_count})")
                                    print(f"Close code: {e.code}, Reason: {e.reason}")
                                    # Send error to frontend with more details
                                    try:
                                        error_msg = f"Deepgram connection lost: {e.reason or 'Unknown reason'} (code: {e.code})"
                                        await websocket.send_text(json.dumps({
                                            "type": "Error",
                                            "message": error_msg
                                        }))
                                    except:
                                        pass
                                    break
                            elif "text" in data:
                                # Text messages might be JSON metadata, forward as-is
                                print(f"Received text message from frontend: {data.get('text', '')[:100]}")
                                try:
                                    await deepgram_ws.send(data["text"])
                                except websockets.exceptions.ConnectionClosed:
                                    print("Deepgram connection closed while sending text")
                                    break
                            elif "type" in data and data["type"] == "websocket.disconnect":
                                # Explicit disconnect message from FastAPI
                                print(f"Frontend sent disconnect message after {chunk_count} chunks")
                                break
                            else:
                                # Unknown data format - log but don't break, keep connection alive
                                print(f"Received unexpected data format: {list(data.keys())}")
                        except WebSocketDisconnect:
                            print(f"Frontend disconnected (normal close) after {chunk_count} chunks")
                            break
                        except RuntimeError as e:
                            # FastAPI raises RuntimeError when trying to receive after disconnect
                            error_msg = str(e)
                            if "disconnect" in error_msg.lower() or "receive" in error_msg.lower():
                                print(f"Frontend WebSocket disconnected (RuntimeError) after {chunk_count} chunks: {error_msg}")
                                break
                            else:
                                # Some other RuntimeError, re-raise it
                                raise
                        except Exception as e:
                            print(f"Error forwarding to Deepgram: {type(e).__name__}: {e}")
                            # Don't break on individual message errors, continue receiving
                            import traceback
                            traceback.print_exc()
                            continue
                except Exception as e:
                    print(f"Error in forward_to_deepgram loop: {type(e).__name__}: {e}")
                    import traceback
                    traceback.print_exc()
                    # Re-raise to signal the connection should close
                    raise
            
            # Run both forwarding tasks concurrently
            # Use return_exceptions=True so one task failing doesn't kill the other
            try:
                results = await asyncio.gather(
                    forward_from_deepgram(),
                    forward_to_deepgram(),
                    return_exceptions=True
                )
                
                # Log any exceptions
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        print(f"Task {i} ended with exception: {type(result).__name__}: {result}")
                    elif result is None:
                        print(f"Task {i} completed normally")
            finally:
                # Only close frontend connection if it's still open and we're actually done
                # Don't close if the frontend just stopped sending data (they might start again)
                try:
                    # Check if frontend is still connected before closing
                    # If forward_to_deepgram ended due to disconnect, the connection is already closed
                    await websocket.close()
                    print("Closed frontend WebSocket connection")
                except Exception as e:
                    # Connection might already be closed, which is fine
                    print(f"Frontend connection already closed or error closing: {e}")
                    pass
            
    except websockets.exceptions.InvalidStatusCode as e:
        error_msg = f"Failed to connect to Deepgram: HTTP {e.status_code}"
        print(f"Deepgram connection error: {error_msg}")
        print(f"Status code: {e.status_code}")
        print(f"Response headers: {getattr(e, 'headers', 'N/A')}")
        print(f"Deepgram URL used: {deepgram_url}")
        print(f"API key present: {bool(deepgram_api_key)}")
        await websocket.send_text(json.dumps({
            "type": "Error",
            "message": f"Deepgram connection failed: HTTP {e.status_code}. Check API key and URL format."
        }))
        await websocket.close()
    except Exception as e:
        error_msg = f"WebSocket proxy error: {str(e)}"
        print(f"WebSocket proxy error details: {type(e).__name__}: {error_msg}")
        import traceback
        traceback.print_exc()
        await websocket.send_text(json.dumps({
            "type": "Error",
            "message": error_msg
        }))
        await websocket.close()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/test_fallback")
async def test_fallback(request: TextRequest):
    """Test endpoint to verify fallback analysis works"""
    try:
        result = fallback_sentiment_analysis(request.text)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Fallback test failed: {str(e)}"
        )


@app.get("/test_openai")
async def test_openai():
    """Test endpoint to verify OpenAI API is working"""
    try:
        # Check if API key is configured
        client = get_openai_client()
        
        # Make a simple test call to OpenAI
        test_prompt = "Say 'API test successful' in exactly 3 words."
        
        try:
            response = await asyncio.wait_for(
                call_openai(test_prompt),
                timeout=10.0
            )
            
            return {
                "status": "success",
                "message": "OpenAI API is working correctly",
                "response": response,
                "api_key_configured": True
            }
        except asyncio.TimeoutError:
            return {
                "status": "timeout",
                "message": "OpenAI API request timed out",
                "api_key_configured": True
            }
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            
            # Check for specific error types
            is_quota_error = (
                "quota" in error_msg.lower() or 
                "429" in error_msg or 
                "rate limit" in error_msg.lower() or 
                "insufficient_quota" in error_msg.lower() or
                error_type == "RateLimitError"
            )
            
            is_auth_error = (
                "api key" in error_msg.lower() or
                "authentication" in error_msg.lower() or
                "401" in error_msg or
                "invalid" in error_msg.lower() and "key" in error_msg.lower()
            )
            
            return {
                "status": "error",
                "message": "OpenAI API call failed",
                "error": error_msg,
                "error_type": error_type,
                "api_key_configured": True,
                "is_quota_error": is_quota_error,
                "is_auth_error": is_auth_error
            }
            
    except ValueError as e:
        # API key not configured
        return {
            "status": "error",
            "message": "OpenAI API key not configured",
            "error": str(e),
            "api_key_configured": False
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "Unexpected error testing OpenAI API",
            "error": str(e),
            "api_key_configured": None
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

