#!/usr/bin/env python3
"""
Simple script to test OpenAI API connection
Run this from the backend directory: python test_openai.py
"""
import os
import sys
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

def test_openai():
    """Test OpenAI API connection"""
    print("Testing OpenAI API connection...")
    print("-" * 50)
    
    # Check if API key is set
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENAI_API_KEY environment variable is not set")
        print("\nPlease set it in your .env file or environment:")
        print("  export OPENAI_API_KEY='your-api-key-here'")
        return False
    
    # Check key format (should start with 'sk-')
    if not api_key.startswith('sk-'):
        print(f"⚠️  WARNING: API key doesn't start with 'sk-' (format may be incorrect)")
        print(f"   Key starts with: {api_key[:5]}...")
    
    print(f"✅ API key found: {api_key[:7]}...{api_key[-4:]}")
    print()
    
    # Try to create client
    try:
        client = OpenAI(api_key=api_key)
        print("✅ OpenAI client created successfully")
    except Exception as e:
        print(f"❌ ERROR creating OpenAI client: {e}")
        return False
    
    # Make a simple test call
    print("\nMaking test API call...")
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'API test successful' in exactly 3 words."}
            ],
            temperature=0.3,
            max_tokens=20
        )
        
        result = response.choices[0].message.content
        print(f"✅ API call successful!")
        print(f"   Response: {result}")
        print()
        print("🎉 OpenAI API is working correctly!")
        return True
        
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        
        print(f"❌ API call failed!")
        print(f"   Error type: {error_type}")
        print(f"   Error message: {error_msg}")
        print()
        
        # Provide helpful diagnostics
        if "quota" in error_msg.lower() or "429" in error_msg or "insufficient_quota" in error_msg.lower():
            print("💡 This appears to be a QUOTA/RATE LIMIT error.")
            print("   - Check your OpenAI account billing and usage")
            print("   - You may have exceeded your API quota")
        elif "api key" in error_msg.lower() or "authentication" in error_msg.lower() or "401" in error_msg:
            print("💡 This appears to be an AUTHENTICATION error.")
            print("   - Your API key may be invalid or expired")
            print("   - Check your OpenAI API keys at: https://platform.openai.com/api-keys")
        elif "timeout" in error_msg.lower():
            print("💡 This appears to be a TIMEOUT error.")
            print("   - Check your internet connection")
            print("   - OpenAI API may be experiencing issues")
        else:
            print("💡 Check the error message above for details")
        
        return False

if __name__ == "__main__":
    success = test_openai()
    sys.exit(0 if success else 1)

