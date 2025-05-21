# VUEN-AI: Engineer Coding Test 
*by: Andres Felipe Marin Ramirez*

This project implements a real-time voice-powered E-commerce agent using OpenAI’s Realtime API with WebRTC. The main goal is that the agent captures voice input, displays live transcription of the AI's responses, processes voice commands to filter products using OpenAI function calling, and renders mock product results in the UI.

<center>
<img src='https://drive.google.com/uc?export=view&id=1XfNGJO1f1Tuxwi8tdsG14ASUA7GqqEFO' width='700'><br>
</center>

A demo of the performance of the application was done here: [Video](https://drive.google.com/file/d/1bUKCEQvRCAuY25NsJufUTVxDT1KdvtoE/view?usp=sharing). In case of any error!

## Objective Fulfillment:

The application successfully meets the core objectives:
1.  **Captures voice from the user in real-time:** Achieved via browser's `getUserMedia` API, with an open-mic approach once the session starts.
2.  **Streams live transcription in the browser:** Live transcription of the **AI assistant's speech** is displayed as it's generated.
3.  **Calls a mock E-commerce agent function:** The `filter_products` function is triggered by voice commands, with arguments extracted by OpenAI's model.
4.  **Displays the function call results:** Mock product data is filtered based on voice commands and rendered in a user-friendly format in the UI.

## Requirements Met:

### 1. OpenAI Realtime API (WebRTC):
*   **WebRTC Connection:** The frontend establishes a direct WebRTC peer-to-peer connection with OpenAI's Realtime API, not using WebSockets for the primary audio/event stream.
*   **Model:** The application is configured to use the `gpt-4o-realtime-preview-2024-12-17` model for the AI interaction.

### 2. Python Backend (FastAPI):
*   A Python backend built with FastAPI is provided (`backend/main.py`).
*   **`/session` Endpoint:**
    *   This `POST` endpoint uses an OpenAI Standard API Key (sourced from the `OPENAI_API_KEY` environment variable).
    *   It calls OpenAI's `/v1/realtime/sessions` endpoint to generate an ephemeral key. This request also includes the definition of the `filter_products` tool, enabling the model for function calling.
    *   The ephemeral key (specifically, the `client_secret.value`) is returned to the browser, which then uses it to establish the WebRTC connection.

### 3. Frontend (Vanilla JS):
The frontend (`frontend/index.html`, `frontend/script.js`, `frontend/style.css`) handles the user interaction:
*   **Button Click (Start Session):**
    *   Prompts the user for microphone access.
    *   Fetches the ephemeral key from the backend's `/session` endpoint.
    *   Establishes a WebRTC connection to OpenAI using this key.
    *   Streams audio from the user's microphone to OpenAI once the connection is active.
*   **Live Transcriptions:** Displays the AI assistant's spoken responses as live text in the browser.
*   **Function Call Results Rendering:** When the `filter_products` function is called by the AI, the frontend:
    *   Displays the function name and the arguments received.
    *   Simulates filtering a predefined list of mock products.
    *   Renders the (mock) filtered products in a basic product UI, including placeholder images (if images with matching names are present in the `frontend` directory).
    *   Sends a mock success message back to OpenAI via the data channel to complete the function call loop, allowing the AI to summarize or comment on the results.

### 4. Function Calling: E-commerce Agent:
*   **`filter_products` Function Registered:** The `filter_products` function is defined with the specified schema (name, description, parameters for category, color, and max_price, with category being required). This schema is sent to OpenAI by the backend during session creation.
*   **UI Display on Function Call:** The frontend displays:
    *   The name of the function called (`filter_products`).
    *   The arguments parsed by OpenAI (e.g., category: "shoes", color: "red", max_price: 100).
    *   A list of mock products that match these criteria, simulating the "3 red sneakers under $100" example output.

## Project Structure:

The project is organized into two main folders:

*   **`backend/`**: Contains the Python FastAPI server (`main.py`).
*   **`frontend/`**: Contains the client-side HTML (`index.html`), JavaScript (`script.js`), CSS (`style.css`), and any placeholder product images (e.g., `placeholder_red_sneaker.jpg`).

## How to Run

### Prerequisites
*   Python 3.10+ (This was made on python 3.10)
*   An OpenAI Standard API Key

### Backend Setup
1.  **Clone the repository:**
2.  **Navigate to the `backend` directory:**
    ```bash
    cd path/to/your-project/backend
    ```
3.  **Create and activate a Python virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
4.  **Python Dependencies Used:**
    ```bash
    pip install fastapi uvicorn httpx python-dotenv
    ```
5.  **Set up your OpenAI API Key:**
    *   Modify the content of the `.env` file with your API key:
        ```
        OPENAI_API_KEY="sk-YOUR_ACTUAL_OPENAI_API_KEY"
        ```
    *   Alternatively, set it as an environment variable in your terminal session before running the server.
    *   **IMPORTANT:** Add `.env` to your `.gitignore` file if you are using Git.
6.  **Run the FastAPI backend server:**
    ```bash
    python main.py
    ```

### Frontend Setup & Running
1.  **Serve the frontend files:** The `frontend` directory contains `index.html`, `script.js`, `style.css`, and placeholder images.
    *   **Using VS Code Live Server:**
        *   Open the `frontend` folder in VS Code.
        *   Right-click on `index.html` and select "Open with Live Server".
        *   This will typically open the application in your browser at an address like `http://127.0.0.1:5500/frontend/index.html` (ensure the port matches what's allowed in the backend's CORS settings in `main.py`).
    *   **Using Python's built-in HTTP server:**
        *   Open a new terminal.
        *   Navigate to the root directory of your project (the one containing the `frontend` and `backend` folders).
        *   Run: `python -m http.server 8080` (or another port).
        *   Open your browser to `http://localhost:8080/frontend/index.html`.
        *   Ensure this origin (`http://localhost:8080`) is added to the `origins` list in `backend/main.py` for CORS.

2.  **Use the Application:**
    *   Once the page loads, click the "Start Session" button.
    *   Grant microphone access when prompted by the browser.
    *   The status should indicate that the connection is active.
    *   Start speaking your e-commerce queries (e.g., "Show me red sneakers under $100," "I'm looking for blue shirts").
    *   Observe the live transcript of the AI's responses, function call results, and use the UX features like pause/resume audio, copy transcript, and clear conversation.

## Technical Implementation Details

### Backend (FastAPI - `main.py`)
*   **`/session` Endpoint:**
    *   Receives a POST request from the frontend.
    *   Makes an asynchronous `POST` request to `https://api.openai.com/v1/realtime/sessions` using `httpx`.
    *   The payload to OpenAI includes the `model` (`gpt-4o-realtime-preview-2024-12-17`) and the `tools` array containing the schema for the `filter_products` function.
    *   Extracts the ephemeral key (`client_secret.value`) from OpenAI's response.
    *   Returns this key and the raw OpenAI response to the frontend.
*   **CORS:** Configured to allow requests from the frontend's origin.
*   **Error Handling:** Includes basic error handling for HTTP errors from OpenAI and other exceptions.

### Frontend (Vanilla JavaScript - `script.js`)
*   **WebRTC Connection:**
    *   Uses `RTCPeerConnection` to establish the connection.
    *   Handles SDP offer/answer exchange with OpenAI's `/v1/realtime` endpoint (using the ephemeral key and `Content-Type: application/sdp`).
    *   Manages local audio tracks (`MediaStream`) and adds the user's microphone track to the peer connection.
    *   Receives the remote audio track from OpenAI and plays it using an `<audio>` element.
*   **Data Channel (`oai-events`):**
    *   Creates an RTCDataChannel named `oai-events` for sending/receiving JSON messages with OpenAI.
    *   **Sending Tool Definition:** On data channel open, sends a `session.update` event to OpenAI with the `filter_products` tool schema (though the backend also sends this during session creation, this ensures client-side awareness or can be used for dynamic updates if needed, but primarily relies on backend definition).
    *   **Receiving Server Events:** Parses incoming JSON messages and routes them to `handleServerEvent`.
    *   **Sending Function Call Output:** When a function call is processed, a `conversation.item.create` event (type `function_call_output`) is sent back to OpenAI with the (mock) results. A `response.create` event is then sent to prompt the AI for a follow-up.
*   **Event Handling (`handleServerEvent`):**
    *   A large `switch` statement processes various events from OpenAI:
        *   `session.created`, `session.updated`
        *   `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped` (for UI feedback with VAD)
        *   `conversation.item.created` (used to attempt to get user transcript, though often `null` for user with this API version; crucial for assistant messages and function call items)
        *   `response.created`, `response.done`
        *   `output_audio_buffer.started`, `output_audio_buffer.stopped` (for `isAssistantSpeaking` state)
        *   `response.audio_transcript.delta`, `response.audio_transcript.done` (for assistant's live and final transcript)
        *   `response.text.delta` (for assistant's text-only responses)
        *   Function call related events to trigger `displayFunctionCall`.
*   **UI Updates:** Dynamically updates HTML elements to show status, transcripts, and function call results.
*   **Mock Product Filtering:** The `displayFunctionCall` function contains client-side logic to filter an array of `MOCK_PRODUCTS` based on the arguments received from the OpenAI function call.
*   **UX Features:** Implements logic for pausing/resuming audio, copying the transcript, mic volume visualization (using Web Audio API: `AudioContext`, `AnalyserNode`), and clearing the conversation display.

*   **Error Handling Robustness:** Enhance error display and recovery mechanisms on both frontend and backend.
*   **Real Product Data:** Integrate with an actual E-commerce API to fetch and display real product information instead of mock data.
*   **State Management:** For larger applications or if using a framework like React, more robust state management solutions would be beneficial.
*   **Deployment:** Instructions for deploying the backend (e.g., Docker, cloud platforms) and frontend.

---
