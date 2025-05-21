# main.py

import os
import httpx # For making async HTTP requests to OpenAI
import uvicorn # For running the FastAPI server
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel # For request/response validation

import os
from dotenv import load_dotenv

load_dotenv() # Load variables from .env file

# --- Configuration ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY environment variable not set. Using a placeholder.")

    #OPENAI_API_KEY = "sk-YOUR_PLACEHOLDER_KEY_IF_NEEDED_FOR_TESTING_WITHOUT_ENV"
    raise ValueError("CRITICAL: OPENAI_API_KEY environment variable not set.")


OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
REQUIRED_MODEL = "gpt-4o-realtime-preview-2024-12-17"

# --- Tool Definition ---
FILTER_PRODUCTS_TOOL_OBJECT = {
    "type": "function",
    "name": "filter_products",
    "description": "Filters products in an online store.",
    "parameters": {
        "type": "object",
        "properties": {
            "category": {"type": "string", "description": "Product category, e.g. shoes, shirts"},
            "color": {"type": "string", "description": "Color of the product"},
            "max_price": {"type": "number", "description": "Maximum price in USD"}
        },
        "required": ["category"]
    }
}


# Response model for /session to frontend
class FrontendSessionResponse(BaseModel):
    raw_openai_response: dict
    ephemeral_key_value: str

# --- FastAPI App Initialization ---
app = FastAPI(title="VUEN AI E-commerce Agent Backend")

# --- CORS Middleware ---
origins = [
    "http://localhost",         
    "http://localhost:5500",    
    "http://127.0.0.1",
    "http://127.0.0.1:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

# --- API Endpoints ---
@app.post("/session", response_model=FrontendSessionResponse)
async def create_openai_realtime_session():
    print("Backend: /session endpoint called. Requesting REAL ephemeral key from OpenAI.")
    
    if not OPENAI_API_KEY or "PLACEHOLDER" in OPENAI_API_KEY:
        print("Backend Error: OpenAI API Key is not properly configured.")
        raise HTTPException(status_code=500, detail="OpenAI API Key not configured on the server.")

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": REQUIRED_MODEL,
        "tools": [FILTER_PRODUCTS_TOOL_OBJECT],
        "voice": "alloy" 
    }
    print(f"Backend: Sending payload to OpenAI: {payload}")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(OPENAI_REALTIME_SESSIONS_URL, headers=headers, json=payload)
            response.raise_for_status() 
            
            openai_session_data = response.json()
            print(f"Backend: Received response from OpenAI: {openai_session_data.get('id', 'No ID')}")

            actual_ephemeral_key = None
            if "client_secret" in openai_session_data and isinstance(openai_session_data["client_secret"], dict) \
               and "value" in openai_session_data["client_secret"]:
                actual_ephemeral_key = openai_session_data["client_secret"]["value"]
            
            if not actual_ephemeral_key:
                error_msg = "Ephemeral key not found in 'client_secret.value' in OpenAI's response."
                print(f"Backend Error: {error_msg} Response: {openai_session_data}")
                raise HTTPException(status_code=500, detail=error_msg)

            print(f"Backend: Extracted REAL ephemeral key: {actual_ephemeral_key[:10]}...")

            return FrontendSessionResponse(
                raw_openai_response=openai_session_data,
                ephemeral_key_value=actual_ephemeral_key
            )

        except httpx.HTTPStatusError as e:
            error_details = e.response.text
            try:
                error_details_json = e.response.json()
                error_details = error_details_json.get("error", {}).get("message", e.response.text)
            except Exception: 
                pass 
            print(f"Backend Error: HTTP error calling OpenAI: {e.response.status_code} - {error_details}")
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from OpenAI: {error_details}")
        except Exception as e:
            print(f"Backend Error: An unexpected error occurred: {str(e)}")
            raise HTTPException(status_code=500, detail=f"An unexpected backend error: {str(e)}")

@app.get("/")
async def read_root():
    return {"message": "VUEN AI E-commerce Agent Backend is running!"}

if __name__ == "__main__":
    print("Starting Uvicorn server directly from main.py...")
    uvicorn.run(
        "main:app",  
        host="127.0.0.1",
        port=8000,
        reload=True    
    )