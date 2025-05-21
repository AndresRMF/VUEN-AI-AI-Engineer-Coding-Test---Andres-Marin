// References to HTML elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const audioToggleButton = document.getElementById('audioToggleButton');
const statusMessage = document.getElementById('statusMessage');
const interimTranscript = document.getElementById('interimTranscript');
const transcriptOutput = document.getElementById('transcriptOutput');
const functionCallOutput = document.getElementById('functionCallOutput');
const copyTranscriptButton = document.getElementById('copyTranscriptButton');
const micVolumeMeterEl = document.getElementById('micVolumeMeter'); 
const micVolumeBarEl = document.getElementById('micVolumeBar');
const clearConversationButton = document.getElementById('clearConversationButton');

const BACKEND_SESSION_URL = 'http://localhost:8000/session';
const OPENAI_REALTIME_BASE_URL = "https://api.openai.com/v1/realtime";
const OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

let audioContext;
let analyser;
let microphoneSource;
let dataArray;
let volumeMeterInterval;

let currentSessionData = null;
let rtcPeerConnection;
let rtcDataChannel;
let localMediaStream;
let userAudioTrack = null;
let remoteAudioElement;
let isAssistantSpeaking = false;
let currentAssistantSpokenTranscript = "";

const MOCK_PRODUCTS = [
  { id: 1, name: "Sporty Sneaker", category: "sneakers", color: "red", price: 79.99, image: "placeholder_red_sneaker.jpg" },
  { id: 2, name: "Casual Canvas Shoe", category: "sneakers", color: "red", price: 59.00, image: "placeholder_red_canvas.jpg" },
  { id: 3, name: "Pro Running Sneaker", category: "sneakers", color: "red", price: 95.50, image: "placeholder_red_running.jpg" },
  { id: 4, name: "Elegant High Heels", category: "shoes", color: "black", price: 120.00, image: "placeholder_black_heels.jpg" }, // Assuming .jpg
  { id: 5, name: "Summer Sandals", category: "shoes", color: "brown", price: 45.00, image: "placeholder_brown_sandals.jpg" }, // Assuming .jpg
  { id: 6, name: "Classic T-Shirt", category: "shirts", color: "blue", price: 25.00, image: "placeholder_blue_tshirt.jpg" },   // Assuming .jpg
  { id: 7, name: "V-Neck T-Shirt", category: "shirts", color: "blue", price: 22.00, image: "placeholder_blue_vneck.jpg" },   // Assuming .jpg
  { id: 8, name: "Formal Shirt", category: "shirts", color: "white", price: 60.00, image: "placeholder_white_shirt.jpg" },  // Assuming .jpg
  { id: 9, name: "Comfy Hoodie", category: "shirts", color: "grey", price: 55.00, image: "placeholder_grey_hoodie.jpg"},    // Assuming .jpg
  { id: 10, name: "Leather Boots", category: "shoes", color: "black", price: 150.00, image: "placeholder_black_boots.jpg"}    // Assuming .jpg
];


// --- Event Listeners ---
startButton.addEventListener('click', handleStartSession);
stopButton.addEventListener('click', handleStopSession);
copyTranscriptButton.addEventListener('click', handleCopyTranscript); 
clearConversationButton.addEventListener('click', handleClearConversation);
audioToggleButton.addEventListener('click', toggleAudioInput);

function toggleAudioInput() {
  if (!userAudioTrack || !rtcDataChannel || rtcDataChannel.readyState !== 'open') {
      console.warn("Cannot toggle audio: track or data channel not ready.");
      return;
  }

  isAudioInputPaused = !isAudioInputPaused; // Toggle the state

  if (isAudioInputPaused) {
      userAudioTrack.enabled = false;
      audioToggleButton.textContent = "Resume Audio Input";
      audioToggleButton.classList.add('paused');
      stopMicVolumeMonitoring(); // Stop visual feedback for mic volume
      interimTranscript.textContent = "User (audio paused)";
      console.log("User audio input PAUSED.");
  } else {
      userAudioTrack.enabled = true;
      audioToggleButton.textContent = "Pause Audio Input";
      audioToggleButton.classList.remove('paused');
      startMicVolumeMonitoring(); // Resume visual feedback for mic volume
      interimTranscript.textContent = "User (listening...)"; // Or clear it
      console.log("User audio input RESUMED.");
  }
}


function handleClearConversation() {
  console.log("Clear Conversation button clicked");
  transcriptOutput.innerHTML = "";
  functionCallOutput.innerHTML = "";
  interimTranscript.textContent = ""; // Clear any live interim text
  statusMessage.textContent = "Conversation cleared. Ready for a new query."; // keep existing status

  // Disable copy button as transcript is now empty
  copyTranscriptButton.disabled = true;
  

  // Inform the user they can speak again
  if (!audioToggleButton.disabled) { // Check the new toggle button's state
    statusMessage.textContent += " Speak when ready or resume audio."; // Updated message
  }

  console.log("UI cleared. Next PTT will be a new query in the current session.");
}

function setupMicVolumeMonitor() {
  if (!localMediaStream || audioContext) return;

  try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphoneSource = audioContext.createMediaStreamSource(localMediaStream);
      
      // Connect the microphone source to the analyser
      microphoneSource.connect(analyser);
      
      // Analyser settings
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      console.log("Mic volume monitor set up.");
  } catch (e) {
      console.error("Error setting up mic volume monitor:", e);
      if (analyser) analyser.disconnect();
      if (microphoneSource) microphoneSource.disconnect();
      if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().then(() => console.log("AudioContext closed."));
      }
      audioContext = null;
      analyser = null;
      microphoneSource = null;
      dataArray = null;
  }
}

if (micVolumeBarEl) {
  micVolumeBarEl.style.width = '0%';
}

function startMicVolumeMonitoring() {
  if (!audioContext || !analyser || !userAudioTrack || !userAudioTrack.enabled) {
      return;
  }
  if (volumeMeterInterval) {
      clearInterval(volumeMeterInterval);
  }

  console.log("Starting mic volume monitoring.");
  volumeMeterInterval = setInterval(() => {
      if (!userAudioTrack || !userAudioTrack.enabled) { 
          updateMicVolumeMeter(0); 
          return;
      }
      analyser.getByteTimeDomainData(dataArray); 

      let sumSquares = 0.0;
      for (const amplitude of dataArray) {
          // Normalize to -1 to 1 range, then square
          const normalizedAmplitude = (amplitude / 128.0) - 1.0;
          sumSquares += normalizedAmplitude * normalizedAmplitude;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      

      let volumePercent = Math.min(100, rms * 200); 

      if (volumePercent > 0 && volumePercent < 5) {
          volumePercent = 5;
      }

      updateMicVolumeMeter(volumePercent);
  }, 100); // Update every 100ms
}

function stopMicVolumeMonitoring() {
  if (volumeMeterInterval) {
      clearInterval(volumeMeterInterval);
      volumeMeterInterval = null;
      console.log("Stopped mic volume monitoring.");
  }
  updateMicVolumeMeter(0); // Reset meter to 0
}

function updateMicVolumeMeter(volumePercent) {
  if (micVolumeBarEl) { // Check if element exists
      micVolumeBarEl.style.width = volumePercent + '%';
  }
}

function handleCopyTranscript() {
  const textToCopy = transcriptOutput.innerText || transcriptOutput.textContent; // Handles different browser ways of getting text
  if (!textToCopy.trim()) {
      alert("Nothing to copy in the transcript.");
      return;
  }

  navigator.clipboard.writeText(textToCopy)
      .then(() => {
          console.log('Transcript copied to clipboard!');
          // Briefly change button text to give feedback
          const originalButtonText = copyTranscriptButton.textContent;
          copyTranscriptButton.textContent = "Copied!";
          copyTranscriptButton.disabled = true;
          setTimeout(() => {
              copyTranscriptButton.textContent = originalButtonText;
              copyTranscriptButton.disabled = transcriptOutput.children.length === 0;
          }, 1500);
      })
      .catch(err => {
          console.error('Failed to copy transcript: ', err);
          alert("Failed to copy transcript. Your browser might not support this feature or permission was denied.");
      });
}

async function getMicrophoneAccess() {
  console.log("Attempting to get microphone access...");
  try {
      localMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log("Microphone access granted.");
      statusMessage.textContent += " Mic access granted.";
      setupMicVolumeMonitor(); 
      return true;
  } catch (err) {
      console.error("Error accessing microphone:", err);
      statusMessage.textContent = "Microphone access denied. Please allow microphone access. " + err.message;
      alert("Microphone access was denied. This app requires microphone access to function. Please grant access and try again.");
      return false;
  }
}

async function connectToOpenAIRealtime(ephemeralKeyValue) {
    console.log("Attempting to connect to OpenAI Realtime API with WebRTC...");
    statusMessage.textContent = "Connecting to OpenAI Realtime API...";

    if (!localMediaStream) {
        console.error("Local media stream (microphone) not available for WebRTC.");
        statusMessage.textContent = "Error: Microphone not ready for WebRTC.";
        return false;
    }

    if (rtcPeerConnection) {
      console.warn("An existing RTCPeerConnection was found. Closing it before creating a new one.");
      try { rtcPeerConnection.close(); } catch (e) { /* ignore */ }
      rtcPeerConnection = null;
    }

    try {
        rtcPeerConnection = new RTCPeerConnection();
        remoteAudioElement = document.createElement("audio");
        remoteAudioElement.autoplay = true;
        document.body.appendChild(remoteAudioElement);
        
        rtcPeerConnection.ontrack = (event) => {
            console.log("Received remote track from OpenAI:", event.track, event.streams);
            if (event.streams && event.streams[0]) {
                remoteAudioElement.srcObject = event.streams[0];
            } else {
                let inboundStream = new MediaStream();
                inboundStream.addTrack(event.track);
                remoteAudioElement.srcObject = inboundStream;
            }
        };

        const audioTracks = localMediaStream.getAudioTracks();
        if (audioTracks.length > 0) {
            userAudioTrack = audioTracks[0];
            console.log("Attempting to add local audio track:", userAudioTrack);
            rtcPeerConnection.addTrack(userAudioTrack, localMediaStream);
            console.log("Successfully added local audio track to PeerConnection.");
            userAudioTrack.enabled = true; 
            isAudioInputPaused = false; // Reflects that audio is not manually paused by user
            console.log("User audio track initially ENABLED (open mic).");
        } else {
            console.error("No audio tracks found in localMediaStream.");
            statusMessage.textContent = "Error: No microphone audio track found.";
            return false;
        }

        rtcDataChannel = rtcPeerConnection.createDataChannel("oai-events", { ordered: true });
        console.log("Created data channel 'oai-events'");

        rtcDataChannel.onopen = () => {
          console.log("Data channel 'oai-events' OPENED.");
          statusMessage.textContent = "Realtime connection active. Speak when ready.";
          sendToolDefinition(); // VAD settings are usually default
          // Enable the new audio toggle button
          audioToggleButton.disabled = false;
          audioToggleButton.textContent = "Pause Audio Input";
          audioToggleButton.classList.remove('paused');
          startMicVolumeMonitoring(); 
        };

        rtcDataChannel.onmessage = (event) => {
            try {
                const serverEvent = JSON.parse(event.data);
                handleServerEvent(serverEvent);
            } catch (e) {
                console.error("Error parsing server event JSON:", e, "Raw data:", event.data);
            }
        };

        rtcDataChannel.onclose = () => {
            console.log("Data channel 'oai-events' CLOSED.");
            statusMessage.textContent = "Realtime connection closed.";
            audioToggleButton.disabled = true;
        };

        rtcDataChannel.onerror = (error) => {
            console.error("Data channel 'oai-events' ERROR:", error);
            statusMessage.textContent = "Realtime connection error: " + (error.message || "Unknown data channel error");
        };
        
        rtcPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Generated ICE candidate:", event.candidate.candidate);
            } else {
                console.log("All ICE candidates have been gathered.");
            }
        };
        
        rtcPeerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state change: ${rtcPeerConnection.iceConnectionState}`);
            statusMessage.textContent = `Connection state: ${rtcPeerConnection.iceConnectionState}`;
            if (['failed', 'disconnected', 'closed'].includes(rtcPeerConnection.iceConnectionState)) {
                console.error("WebRTC connection failed, disconnected, or closed.");
            }
        };

        const offer = await rtcPeerConnection.createOffer();
        await rtcPeerConnection.setLocalDescription(offer);
        console.log("Created SDP offer and set local description.");

        const sdpNegotiationUrl = `${OPENAI_REALTIME_BASE_URL}?model=${OPENAI_REALTIME_MODEL}`;
        console.log("Sending SDP offer to:", sdpNegotiationUrl);

        const sdpResponse = await fetch(sdpNegotiationUrl, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${ephemeralKeyValue}`,
                "Content-Type": "application/sdp"
            },
        });

        if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            throw new Error(`SDP negotiation failed: ${sdpResponse.status} ${sdpResponse.statusText}. Response: ${errorText}`);
        }

        const answerSdp = await sdpResponse.text();
        console.log("Received SDP answer.");
        const answer = { type: "answer", sdp: answerSdp };
        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("Set remote description with SDP answer.");
        statusMessage.textContent = "WebRTC negotiation complete. Waiting for data channel to open...";
        return true;

    } catch (error) {
      console.error("Error establishing WebRTC connection with OpenAI:", error);
      statusMessage.textContent = `WebRTC Connection Error: ${error.message}`;
      if (rtcPeerConnection) try { rtcPeerConnection.close(); } catch (e) { /* ignore */ }
      rtcPeerConnection = null;
      if (userAudioTrack) userAudioTrack.enabled = false; 
      return false;
    }
    return true;
}

function sendToolDefinition() {
    if (!rtcDataChannel || rtcDataChannel.readyState !== 'open') {
        console.warn("Data channel not open, cannot send tool definition.");
        statusMessage.textContent = "Error: Data channel not ready for tool definition.";
        return;
    }
    const filterProductsTool = {
        type: "function",
        name: "filter_products",
        description: "Filters products in an online store.",
        parameters: {
            type: "object",
            properties: {
                category: { type: "string", description: "Product category, e.g. shoes, shirts" },
                color: { type: "string", description: "Color of the product" },
                max_price: { type: "number", description: "Maximum price in USD" }
            },
            required: ["category"]
        }
    };
    const sessionUpdateEvent = {
        type: "session.update",
        session: { tools: [filterProductsTool], tool_choice: "auto" }
    };
    console.log("Sending session.update with tool definition:", JSON.stringify(sessionUpdateEvent, null, 2));
    rtcDataChannel.send(JSON.stringify(sessionUpdateEvent));
    statusMessage.textContent = "Tool definition sent. Session ready.";
}

function handleServerEvent(event) {
  console.log(`Handling server event: ${event.type}`, event);

  switch (event.type) {
      case "session.created":
          console.log("Session created with OpenAI:", event.session);
          statusMessage.textContent = `OpenAI Session ${event.session.id} created.`;
          break;

      case "session.updated":
          console.log("Session updated by OpenAI:", event.session);
          statusMessage.textContent = "OpenAI Session configuration updated.";
          if (event.session.tools && event.session.tools.some(tool => tool.name === "filter_products")) {
              console.log("filter_products tool successfully acknowledged by OpenAI.");
          }
          break;

      case "input_audio_buffer.speech_started":
        console.log("Speech started detected by OpenAI (user input).");
        if (!isAudioInputPaused) { 
            interimTranscript.textContent = "User (listening...)";
        }
        break;

        case "input_audio_buffer.speech_stopped":
          console.log("Speech stopped detected by OpenAI (user input). Item ID:", event.item_id);

          if (!isAudioInputPaused) {
              interimTranscript.textContent = "User (processing...)";
          }
          break;
          
      case "input_audio_buffer.committed":
          console.log("Audio input committed by OpenAI:", event.item_id);
          break;
    
      case "conversation.item.created":
          console.log("Conversation item created by OpenAI:", event.item);
          if (event.item.type === "message" && event.item.role === "user" && event.item.status === "completed") {
              console.log("Full user conversation item (RAW for debugging):", JSON.stringify(event.item, null, 2));
              let userText = "";
              if (event.item.content && event.item.content.length > 0) {
                  event.item.content.forEach(part => {
                      console.log("User message content part (for debugging):", JSON.stringify(part, null, 2));
                      // Check if 'part' itself is the transcript object OR if it's nested
                      if (part.type === "input_audio" && part.transcript && typeof part.transcript === 'string') {
                          userText += part.transcript + " ";
                      } else if (part.type === "text" && part.text) { // Less likely for direct voice input
                          userText += part.text + " ";
                      } else if (part.transcript && typeof part.transcript.text === 'string') { // Another possible nesting
                           userText += part.transcript.text + " ";
                      }
                  });
              }
              userText = userText.trim();

              if (userText) {
                  console.log("Final user transcript from conversation.item.created:", userText);
                  appendFinalTranscript("User: " + userText);
              } else {
                  console.warn("User conversation item created, but NO TEXT could be extracted from 'content' array (transcript was null or not found). Item:", event.item);

              }
              interimTranscript.textContent = ""; 
          } else if (event.item.type === "function_call") {
              console.log("Function call item created in conversation (status: " + event.item.status + "):", event.item.name);
          } else if (event.item.type === "function_call_output") {
              console.log("Function call output item created in conversation:", event.item.call_id);
          } else if (event.item.role === "assistant") {
              console.log("Assistant message item created in conversation (status: " + event.item.status + "):", event.item);
          }
          break;
    
      case "response.created":
          console.log("OpenAI is creating a response:", event.response);
          if (interimTranscript.textContent.startsWith("User (processing)")) {
              interimTranscript.textContent = "";
          }
          // Prepare for potential assistant speech by clearing old assistant transcript
          currentAssistantSpokenTranscript = "";
          isAssistantSpeaking = false;
          break;

      case "output_audio_buffer.started":
          console.log("OpenAI audio output started.");
          isAssistantSpeaking = true;
          displayInterimTranscript(currentAssistantSpokenTranscript, false);
          break;
      
      case "output_audio_buffer.stopped":
          console.log("OpenAI audio output stopped.");
          isAssistantSpeaking = false;
          break;
      
      case "response.audio_transcript.delta":
          currentAssistantSpokenTranscript += event.delta;
          displayInterimTranscript(currentAssistantSpokenTranscript, false); // Display assistant's accumulating speech
          break;

      case "response.text.delta":
          console.log("response.text.delta, delta:", event.delta);
          currentAssistantSpokenTranscript += event.delta;
          displayInterimTranscript(currentAssistantSpokenTranscript, false); // Display as assistant interim text
          break;
      
      case "response.audio_transcript.done":
          console.log("Audio transcript done event (for assistant's speech):", event);
          const finalAssistantTextFromEvent = event.transcript?.trim();
          const finalAssistantTextFromAcc = currentAssistantSpokenTranscript.trim();

          let finalAssistantTextToDisplay = "";
          if (finalAssistantTextFromEvent) {
              finalAssistantTextToDisplay = finalAssistantTextFromEvent;
              if (finalAssistantTextFromAcc && finalAssistantTextFromAcc !== finalAssistantTextFromEvent) {
                  console.warn("Accumulated assistant delta transcript differs from audio_transcript.done. Using .done version. Accumulated:", finalAssistantTextFromAcc, "Done event:", finalAssistantTextFromEvent);
              }
          } else if (finalAssistantTextFromAcc) {
              console.warn("response.audio_transcript.done had no transcript, using accumulated deltas:", finalAssistantTextFromAcc);
              finalAssistantTextToDisplay = finalAssistantTextFromAcc;
          }

          if (finalAssistantTextToDisplay) {
              console.log("Final assistant spoken transcript (from audio_transcript.done or deltas):", finalAssistantTextToDisplay);
              appendFinalTranscript("OpenAI: " + finalAssistantTextToDisplay);
          } else {
               console.warn("response.audio_transcript.done: No final assistant transcript to display from event or deltas.");
          }
          currentAssistantSpokenTranscript = ""; // Clear for the next assistant utterance
          if (interimTranscript.textContent.startsWith("OpenAI (speaking):")) {
               interimTranscript.textContent = "";
          }
          break;

      case "response.done":
          console.log("Full response received from OpenAI:", event.response);

          if (event.response.status === "failed") {
              console.error("OpenAI response generation FAILED. Details:", event.response.status_details);
              statusMessage.textContent = `Error from OpenAI: Response failed. Reason: ${event.response.status_details?.code || 'Unknown error'}`;
              if (event.response.status_details?.message) {
                  appendFinalTranscript(`OpenAI Error: ${event.response.status_details.message}`);
              }
              currentAssistantSpokenTranscript = ""; 
              interimTranscript.textContent = "";    
              break; 
          }

          if (event.response.output && event.response.output.length > 0) {
              const outputItem = event.response.output[0];

              if (outputItem.type === "function_call" && outputItem.status === "completed") {
                  console.log("Function call requested by OpenAI (in response.done):", outputItem);
                  const functionName = outputItem.name;
                  const callId = outputItem.call_id;
                  let functionArgs = {};
                  try { functionArgs = JSON.parse(outputItem.arguments); } catch (e) { console.error("Error parsing function call arguments JSON:", e, outputItem.arguments); }
                  displayFunctionCall(functionName, functionArgs);
                  const mockFunctionResult = { /* ... */ };
                  const functionResultEvent = { type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(mockFunctionResult) } };
                  rtcDataChannel.send(JSON.stringify(functionResultEvent));
                  const subsequentResponseEvent = { type: "response.create" };
                  rtcDataChannel.send(JSON.stringify(subsequentResponseEvent));

              } else if (outputItem.type === "message" && outputItem.role === "assistant" && outputItem.status === "completed") {
                  console.log("Assistant message item in response.done (completed):", outputItem);
                  
                  let assistantTextFromDoneMessage = "";
                  if (outputItem.content && outputItem.content.length > 0) {
                      outputItem.content.forEach(contentPart => {
                          if (contentPart.type === "text" && contentPart.text) {
                              assistantTextFromDoneMessage += contentPart.text + " ";
                          } else if (contentPart.type === "audio_transcript" && contentPart.transcript && contentPart.transcript.text) { // If assistant transcript is here
                              assistantTextFromDoneMessage += contentPart.transcript.text + " ";
                          } else if (contentPart.type === "audio" && contentPart.transcript && typeof contentPart.transcript === 'string') { // From your logs
                              assistantTextFromDoneMessage += contentPart.transcript + " ";
                          }
                      });
                  }
                  assistantTextFromDoneMessage = assistantTextFromDoneMessage.trim();

                  const lastAppended = transcriptOutput.lastElementChild ? transcriptOutput.lastElementChild.textContent : "";
                  
                  if (currentAssistantSpokenTranscript.trim() && (!lastAppended || !lastAppended.includes(currentAssistantSpokenTranscript.trim()))) {
                      console.log("Finalizing assistant text from accumulated text.deltas at response.done:", currentAssistantSpokenTranscript.trim());
                      appendFinalTranscript("OpenAI: " + currentAssistantSpokenTranscript.trim());
                  } 
                  else if (assistantTextFromDoneMessage && (!lastAppended || !lastAppended.includes(assistantTextFromDoneMessage))) {
                      console.log("Using assistant text from response.done message content (was not from deltas or audio_transcript.done):", assistantTextFromDoneMessage);
                      appendFinalTranscript("OpenAI: " + assistantTextFromDoneMessage);
                  } else if (assistantTextFromDoneMessage && lastAppended && lastAppended.includes(assistantTextFromDoneMessage)) {
                       console.log("Assistant text from response.done message content seems already displayed.");
                  } else {
                       console.log("Assistant message in response.done did not yield new displayable text, or it was already handled.");
                  }
              } else {
                 console.warn("response.done: Unhandled or incomplete output item type:", outputItem.type, outputItem.status, outputItem);
              }
          } else {
            console.log("response.done received (status: " + event.response.status + "), but no output items to process, or not yet completed.");
          }
          currentAssistantSpokenTranscript = "";
          isAssistantSpeaking = false;
          if (interimTranscript.textContent.startsWith("OpenAI (speaking):") || interimTranscript.textContent.startsWith("OpenAI (interim):")) {
              interimTranscript.textContent = "";
          }
          break;

        case "rate_limits.updated":
            console.log("Rate limits updated:", event.rate_limits);
            break;
        case "response.output_item.added": 
            console.log("Response output item added (started):", event.item);
            break;
        case "response.content_part.added": 
            console.log("Response content part added to item:", event.item_id, event.content_part);
            break;
        case "response.function_call_arguments.delta":

            break;
        case "response.function_call_arguments.done":
            console.log("Function call ARGS done:", event.arguments);
            break;
        case "response.audio.done":
            console.log("Response AUDIO stream from OpenAI is done for item:", event.item_id);
            break;
        case "response.content_part.done":
            console.log("Response content part done for item:", event.item_id, event.content_part);
            break;
        case "response.output_item.done": 
            console.log("Response output item done (completed):", event.item);
            break;
        case "error":
            console.error("Error event from OpenAI:", event);
            statusMessage.textContent = `OpenAI Error: ${event.message || JSON.stringify(event.code || event)}`;
            appendFinalTranscript(`OpenAI Error: ${event.message || event.code || 'Unknown error from API'}`);
            currentAssistantSpokenTranscript = "";
            interimTranscript.textContent = "";
            break;

        default:
            console.warn("Unhandled server event type:", event.type, event);
    }
}

async function handleStartSession() {
    console.log("Start Session button clicked");
    startButton.disabled = true;
    stopButton.disabled = false;

    audioToggleButton.disabled = true;
    audioToggleButton.textContent = "Pause Audio Input";
    audioToggleButton.classList.remove('paused');
    isAudioInputPaused = false; 
    copyTranscriptButton.disabled = true;
    clearConversationButton.disabled = true;
    
    interimTranscript.textContent = "";
    transcriptOutput.innerHTML = "";
    functionCallOutput.innerHTML = "";
    statusMessage.textContent = "Initializing session...";

    if (!await getMicrophoneAccess()) {
        startButton.disabled = false;
        stopButton.disabled = true;
        return;
    }

    try {
        statusMessage.textContent = "Fetching session key from backend...";
        const response = await fetch(BACKEND_SESSION_URL, { method: 'POST' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Backend error: ${errorData.detail || response.statusText}`);
        }
        currentSessionData = await response.json();
        console.log("Received session data from backend:", currentSessionData);

        const ephemeralKey = currentSessionData.ephemeral_key_value; 

        if (!ephemeralKey) {
            throw new Error("Ephemeral key not received or found in expected place from backend.");
        }
        statusMessage.textContent = "Session key received. Establishing WebRTC connection...";

        if (!await connectToOpenAIRealtime(ephemeralKey)) {
            throw new Error("Failed to establish WebRTC connection with OpenAI.");
        }

    } catch (error) {
        console.error("Error during session start:", error);
        statusMessage.textContent = `Error: ${error.message}`;
        if (localMediaStream) {
          localMediaStream.getTracks().forEach(track => track.stop());
          localMediaStream = null;
        }
        if (rtcPeerConnection) {
            try { rtcPeerConnection.close(); } catch (e) { /*ignore*/ }
            rtcPeerConnection = null;
        }
        startButton.disabled = false;
        stopButton.disabled = true;
        audioToggleButton.disabled = true;
    }
}

function handleStopSession() {
    console.log("Stop Session button clicked");
    stopMicVolumeMonitoring(); 

    audioToggleButton.disabled = true;
    audioToggleButton.textContent = "Pause Audio Input";
    audioToggleButton.classList.remove('paused');
    isAudioInputPaused = false;

    copyTranscriptButton.disabled = true;
    clearConversationButton.disabled = true; 
    statusMessage.textContent = 'Session stopped. Click "Start Session" to begin again.';

    if (userAudioTrack) {
        userAudioTrack.enabled = false;
    }

    if (rtcDataChannel) {
        try {
            if (rtcDataChannel.readyState === 'open') {
                 console.log("Closing data channel.");
            }
            rtcDataChannel.close();
        } catch (e) { console.warn("Error trying to close data channel:", e); }
        rtcDataChannel = null;
    }

    if (rtcPeerConnection) {
        try { rtcPeerConnection.close(); } catch (e) { console.warn("Error trying to close peer connection:", e); }
        rtcPeerConnection = null;
    }

    if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => track.stop());
        localMediaStream = null;
    }
    userAudioTrack = null; // Now safe to null out
    
    if (remoteAudioElement && remoteAudioElement.parentNode) {
        remoteAudioElement.pause();
        remoteAudioElement.srcObject = null;
        remoteAudioElement.parentNode.removeChild(remoteAudioElement);
        remoteAudioElement = null;
    }
    
    currentSessionData = null;
    isAssistantSpeaking = false;
    currentAssistantSpokenTranscript = "";

    startButton.disabled = false;
    stopButton.disabled = true;
    copyTranscriptButton.disabled = true; // Disable when session stops
    statusMessage.textContent = 'Session stopped. Click "Start Session" to begin again.';
    interimTranscript.textContent = "";
    console.log("WebRTC session resources released.");
}

function displayInterimTranscript(text, isUser = true) {
  if (isUser) {
      interimTranscript.textContent = text; 
  } else { // Assistant is speaking or generating text
      interimTranscript.textContent = "OpenAI (speaking): " + text;
  }
}


function appendFinalTranscript(textWithLabel) {
  interimTranscript.textContent = "";
  const textNode = document.createTextNode(textWithLabel + '\n');
  const p = document.createElement('p');
  p.appendChild(textNode);
  transcriptOutput.appendChild(p);
  transcriptOutput.scrollTop = transcriptOutput.scrollHeight;

  copyTranscriptButton.disabled = transcriptOutput.children.length === 0;
  clearConversationButton.disabled = transcriptOutput.children.length === 0 && functionCallOutput.children.length === 0; 
}

function displayFunctionCall(functionName, args) {
  let argumentsTextParts = [];
  if (args.category) argumentsTextParts.push(`Category: <strong>${args.category}</strong>`); 
  if (args.color) argumentsTextParts.push(`Color: <strong>${args.color}</strong>`);
  if (args.max_price !== undefined) argumentsTextParts.push(`Max Price: <strong>$${args.max_price}</strong>`);
  
  const argumentsText = argumentsTextParts.join('; '); 

  let productHTML = `
        <div class="function-call-summary">
            <p class="function-name"><strong>Function Call:</strong> ${functionName}</p>
            ${argumentsTextParts.length > 0 ? `<p class="function-arguments"><em>Arguments: ${argumentsText}</em></p>` : ''} 
        </div>                                                                      
        <hr>
        <h4>Showing Results:</h4>
    `;


  if (functionName === "filter_products") {
      const filteredProducts = MOCK_PRODUCTS.filter(product => {
          let matchesCategory = true;
          if (args.category) {
              const argCat = args.category.toLowerCase();
              const prodCat = product.category.toLowerCase();
              matchesCategory = argCat.includes(prodCat) || prodCat.includes(argCat);
          }

          let matchesColor = true;
          if (args.color) {
              matchesColor = product.color.toLowerCase() === args.color.toLowerCase();
          }

          let matchesPrice = true;
          if (args.max_price !== undefined) {
              matchesPrice = product.price <= args.max_price;
          }
          return matchesCategory && matchesColor && matchesPrice;
      });

      if (filteredProducts.length > 0) {
          productHTML += `<p>Found ${filteredProducts.length} product(s) matching your criteria:</p>`;
          productHTML += "<ul class='product-list'>"; 
          filteredProducts.forEach(p => {
              productHTML += `<li>
                  <img src="${p.image}" alt="${p.name}" class="product-thumbnail">
                  <div class="product-details">
                      <strong>${p.name}</strong>
                      <span>$${p.price.toFixed(2)} (Color: ${p.color}, Category: ${p.category})</span>
                  </div>
              </li>`;
          });
          productHTML += "</ul>";
      } else {
          productHTML += "<p>No products found matching your criteria.</p>";
      }
  } else {

      productHTML += `<p>Arguments: <pre>${JSON.stringify(args, null, 2)}</pre></p>`;
  }

  productHTML += `<hr><p class="function-execution-status"><em>(Mock function executed, result sent to OpenAI for summary)</em></p>`;
  
  functionCallOutput.innerHTML = productHTML;
  functionCallOutput.scrollTop = functionCallOutput.scrollHeight;
  clearConversationButton.disabled = false;
}

// Initial UI state:
statusMessage.textContent = 'Idle. Click "Start Session".';
stopButton.disabled = true;
audioToggleButton.disabled = true; 
audioToggleButton.textContent = "Pause Audio Input";
audioToggleButton.classList.remove('paused');
isAudioInputPaused = false;
copyTranscriptButton.disabled = true;
clearConversationButton.disabled = true;