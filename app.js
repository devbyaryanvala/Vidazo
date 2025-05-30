// --- DOM Elements ---
const setupView = document.getElementById('setupView');
const inCallView = document.getElementById('inCallView'); // Main container for call interface
const callInfoFooter = document.querySelector('.call-info-footer');
const myClientIdDisplay = document.getElementById('myClientIdDisplay');

const createRoomButton = document.getElementById('createRoomButton'); // Updated ID
const joinRoomButton = document.getElementById('joinRoomButton');   // Updated ID
const callIdInput = document.getElementById('callIdInput'); // Used for Room ID

const uniqueCallIdDisplay = document.getElementById('uniqueCallIdDisplay'); // In footer for Room ID
const callStatus = document.getElementById('callStatus'); // In footer

const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideosContainer');

const muteButton = document.getElementById('muteButton');
const toggleVideoButton = document.getElementById('toggleVideoButton');
const endCallButton = document.getElementById('endCallButton');
const switchCameraButton = document.getElementById('switchCameraButton');

const messagesDiv = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendChatButton = document.getElementById('sendChatButton');

// SVGs for button states (ensure these are valid and single-line for JS strings)
const micOnIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg>`;
const micOffIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,14A3,3 0 0,0 15,11V5A3,3 0 0,0 9,5V11A3,3 0 0,0 12,14M17,11C17,12.5 16.5,13.89 15.67,15L14.28,13.61C14.72,12.97 15,12.05 15,11H17M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7C7,12.05 7.28,12.97 7.72,13.61L6.33,15C5.5,13.89 5,12.5 5,11H3A10,10 0 0,0 11.64,20.91L10.28,19.54C7.03,18.79 4.75,15.79 4.75,12.5L4.8,11H2.8L19.2,17.6L20.75,16.05L12,7.3L10.55,5.85L4.27,19.13L1.25,16.1L19.75,2.6L21.16,4L17,8.16V11Z"/></svg>`;
const videoOnIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/></svg>`;
const videoOffIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.27L21,17.5V6.5L17.8,10.7L16.73,9.63L17,9.5V7A1,1 0 0,0 16,6H9.73L7.73,4H16A1,1 0 0,1 17,3L20.73,22.73L19.46,24L17,21.54V17A1,1 0 0,1 16,18H4A1,1 0 0,1 3,17V7C3,6.57 3.18,6.17 3.46,5.87L1.27,3.68L3.27,2M17,10.5L21,6.5V17.5L17,13.5V10.5Z"/></svg>`;
// End call SVG is static in HTML

// --- WebSocket and WebRTC Variables ---
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}`);

let localStream;
let peerConnections = {}; // Store multiple peer connections { clientId: RTCPeerConnection }
let myClientId;
let currentRoomId; // Changed from currentCallId for consistency
let isAudioMuted = false;
let isVideoOff = false;
let currentVideoDeviceId;
let videoDevices = [];

const peerConnectionConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- Event Listeners ---
createRoomButton.addEventListener('click', createRoom); // Updated ID
joinRoomButton.addEventListener('click', joinRoom);   // Updated ID
muteButton.addEventListener('click', toggleMute);
toggleVideoButton.addEventListener('click', toggleVideo);
endCallButton.addEventListener('click', endCurrentCall);
switchCameraButton.addEventListener('click', handleCameraSwitch);
sendChatButton.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
    }
});

// --- UI Management ---
function showCallInterface(inCall) {
    setupView.classList.toggle('hidden', inCall); // Use setupView for the whole modal
    inCallView.classList.toggle('hidden', !inCall); // Use inCallView for the main call interface
    callInfoFooter.classList.toggle('hidden', !inCall);

    if (inCall) {
        muteButton.innerHTML = micOnIcon;
        toggleVideoButton.innerHTML = videoOnIcon;
        isAudioMuted = false;
        isVideoOff = false;
    } else {
        remoteVideosContainer.innerHTML = '';
    }
}

// --- Media Device Handling ---
async function getConnectedDevices(type = 'videoinput') {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn("enumerateDevices() not supported."); return [];
        }
        // Ensure permissions are prompted by trying to get a stream first if none exists
        // and if we don't already have devices listed (which implies permission was granted)
        if (videoDevices.length === 0 && !(await navigator.mediaDevices.enumerateDevices()).some(d => d.deviceId && d.label)) {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            tempStream.getTracks().forEach(track => track.stop());
        }
    } catch (e) {
        console.warn("Initial permission for device enumeration failed:", e.message);
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === type && device.deviceId);
}

async function updateVideoDeviceList() {
    try {
        videoDevices = await getConnectedDevices('videoinput');
        switchCameraButton.disabled = !(videoDevices && videoDevices.length > 1);
    } catch (error) {
        console.error("Error enumerating video devices:", error);
        switchCameraButton.disabled = true;
    }
}

async function startMedia(deviceId) {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    const constraints = {
        audio: true,
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }
    };
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) currentVideoDeviceId = videoTrack.getSettings().deviceId;
        await updateVideoDeviceList();
    } catch (e) {
        console.error("Error accessing media devices:", e);
        callStatus.textContent = "Camera/Mic access error. Check permissions.";
        alert("Could not access camera/microphone. Check permissions.\nError: " + e.message);
        showCallInterface(false); // Revert to setup screen on critical error
        throw e; // Re-throw to stop further execution like createPeerConnection
    }
}

async function handleCameraSwitch() {
    if (!localStream || videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex(device => device.deviceId === currentVideoDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    if (!videoDevices[nextIndex]) return; // Should not happen if length > 1
    const nextDeviceId = videoDevices[nextIndex].deviceId;

    callStatus.textContent = "Switching camera...";
    try {
        await startMedia(nextDeviceId); // This stops old tracks and starts new ones

        // Update track for all existing peer connections
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            if (pc) {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                const videoTrack = localStream.getVideoTracks()[0]; // Get the new video track
                if (sender && videoTrack) {
                    await sender.replaceTrack(videoTrack);
                } else if (sender && !videoTrack) { // If new stream has no video track (unlikely)
                    await sender.replaceTrack(null);
                } else if (!sender && videoTrack) { // If no sender but new video track
                     pc.addTrack(videoTrack, localStream);
                }
            }
        }
        callStatus.textContent = "Camera switched.";
    } catch (error) {
        console.error("Error switching camera:", error);
        callStatus.textContent = "Error switching camera.";
        // Optionally, try to restore the previous camera or handle error more gracefully
    }
}

// --- WebRTC Logic for Group Call ---
function createPeerConnection(peerId, isInitiator) {
    if (peerConnections[peerId]) {
        console.log("Closing existing peer connection for", peerId);
        peerConnections[peerId].onicecandidate = null;
        peerConnections[peerId].ontrack = null;
        peerConnections[peerId].oniceconnectionstatechange = null;
        peerConnections[peerId].close();
    }
    console.log(`Creating new PeerConnection for ${peerId}. Is initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(peerConnectionConfig);
    peerConnections[peerId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    } else {
        console.error("CRITICAL: Local stream not available when creating peer connection for", peerId);
        // This should ideally not happen if startMedia succeeded before joining/creating room
        return null; 
    }

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({
                type: 'candidate',
                candidate: event.candidate,
                targetId: peerId,
                senderId: myClientId
            }));
        }
    };

    pc.ontrack = event => {
        console.log(`Track received from ${peerId}:`, event.track.kind);
        addRemoteVideo(peerId, event.streams[0]); // event.streams[0] usually contains all tracks
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State for ${peerId}: ${pc.iceConnectionState}`);
        const iceState = pc.iceConnectionState;
         if (iceState === "connected" || iceState === "completed") {
            callStatus.textContent = `Connected. Peers: ${Object.keys(peerConnections).length}`;
        } else if (iceState === "failed" || iceState === "closed" || iceState === "disconnected") {
            console.log(`Connection with ${peerId} ${iceState}.`);
            removeRemoteVideo(peerId);
            if (peerConnections[peerId]) {
                peerConnections[peerId].close();
                delete peerConnections[peerId];
            }
            callStatus.textContent = `Peer ${peerId.substring(0,5)} ${iceState}. Peers: ${Object.keys(peerConnections).length}`;
            updateVideoLayout();
        }
    };
    return pc;
}

// --- Call Management ---
function generateUniqueId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

async function createRoom() { // Renamed from createCall
    if (socket.readyState !== WebSocket.OPEN) { alert("Signaling server not connected."); return; }
    try { await startMedia(); } catch (e) { return; } // Stop if media access fails

    currentRoomId = generateUniqueId();
    uniqueCallIdDisplay.textContent = currentRoomId;
    callStatus.textContent = "Creating room...";
    socket.send(JSON.stringify({ type: 'create_room', roomId: currentRoomId }));
    showCallInterface(true);
    messagesDiv.innerHTML = '';
}

async function joinRoom() {
    if (socket.readyState !== WebSocket.OPEN) { alert("Signaling server not connected."); return; }
    const roomIdToJoin = callIdInput.value.trim();
    if (!roomIdToJoin) { alert("Please enter a Room ID."); return; }
    try { await startMedia(); } catch (e) { return; } // Stop if media access fails

    currentRoomId = roomIdToJoin;
    uniqueCallIdDisplay.textContent = currentRoomId;
    callStatus.textContent = "Joining room: " + currentRoomId + "...";
    socket.send(JSON.stringify({ type: 'join_room', roomId: currentRoomId, clientId: myClientId })); // Send my ID when joining
    showCallInterface(true);
    messagesDiv.innerHTML = '';
}

function endCurrentCall(notifyServer = true) {
    console.log("Ending call. Notify server:", notifyServer);
    if (notifyServer && socket.readyState === WebSocket.OPEN && currentRoomId && myClientId) {
        socket.send(JSON.stringify({ type: 'leave_room', roomId: currentRoomId, clientId: myClientId }));
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            peerConnections[peerId].onicecandidate = null;
            peerConnections[peerId].ontrack = null;
            peerConnections[peerId].oniceconnectionstatechange = null;
            peerConnections[peerId].close();
        }
    }
    peerConnections = {};
    localVideo.srcObject = null;
    remoteVideosContainer.innerHTML = '';

    currentRoomId = null; 
    // myClientId is assigned by server on connection, don't nullify here unless rejoining requires new ID.
    // Let's keep myClientId until socket disconnects or page reloads.
    // myClientIdDisplay.textContent = "N/A"; 
    showCallInterface(false);
    callStatus.textContent = "Call ended. Start or join a new room.";
    uniqueCallIdDisplay.textContent = "N/A";
    switchCameraButton.disabled = true;
    callIdInput.value = "";
    updateVideoLayout();
}

// --- Signaling ---
socket.onopen = () => {
    console.log("WebSocket connection established.");
    callStatus.textContent = "Ready. Create or join a room.";
    updateVideoDeviceList().catch(e => console.error("Error on initial device enumeration:", e));
};

socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.log("Received WS message:", message);

    switch (message.type) {
        case 'client_id_assigned':
            myClientId = message.clientId;
            myClientIdDisplay.textContent = myClientId ? myClientId.substring(0, 8) : "N/A";
            console.log("My Client ID assigned:", myClientId);
            break;
        case 'room_created_ack':
            currentRoomId = message.roomId;
            uniqueCallIdDisplay.textContent = currentRoomId;
            callStatus.textContent = "Room created. Waiting for others...";
            // No peer connections to make yet, wait for 'peer_joined'
            break;
        case 'joined_room_ack': // You have successfully joined a room
            currentRoomId = message.roomId;
            uniqueCallIdDisplay.textContent = currentRoomId;
            callStatus.textContent = `Joined room ${currentRoomId}. Peers found: ${message.peers.length}`;
            // Existing peers (message.peers) will be notified by server that *you* joined.
            // They will then initiate offers to you. You just need to be ready.
            // So, for each peer in message.peers, you will eventually get an 'offer_received'.
            message.peers.forEach(peerId => {
                if (peerId !== myClientId) {
                    console.log(`Awaiting offer from existing peer: ${peerId}`);
                    // No need to create PC here yet, will be created on offer_received
                }
            });
            updateVideoLayout();
            break;
        case 'peer_joined': // An existing client receives this when a new peer joins *their* room
            const newPeerId = message.newPeerId;
            if (newPeerId === myClientId) return; // Should not happen if server logic is correct

            callStatus.textContent = `Peer ${newPeerId.substring(0,5)} joined. Sending offer...`;
            displayChatMessage(`User ${newPeerId.substring(0,5)} joined.`, false, 'System');
            
            const pcForNewPeer = createPeerConnection(newPeerId, true); // true: this client is initiator
            if (pcForNewPeer) {
                try {
                    const offer = await pcForNewPeer.createOffer();
                    await pcForNewPeer.setLocalDescription(offer);
                    socket.send(JSON.stringify({
                        type: 'offer',
                        offer: pcForNewPeer.localDescription,
                        targetId: newPeerId, // Send offer to the new peer
                        senderId: myClientId
                    }));
                    addRemoteVideo(newPeerId, null); // Add placeholder for video element
                } catch (error) {
                    console.error(`Error creating offer for ${newPeerId}:`, error);
                }
            }
            break;
        case 'offer_received':
            const offerSenderId = message.senderId;
            if (offerSenderId === myClientId) return;

            callStatus.textContent = `Offer from ${offerSenderId.substring(0,5)}. Sending answer...`;
            const pcForOffer = createPeerConnection(offerSenderId, false); // false: this client is responder
            if (pcForOffer) {
                try {
                    await pcForOffer.setRemoteDescription(new RTCSessionDescription(message.offer));
                    const answer = await pcForOffer.createAnswer();
                    await pcForOffer.setLocalDescription(answer);
                    socket.send(JSON.stringify({
                        type: 'answer',
                        answer: pcForOffer.localDescription,
                        targetId: offerSenderId, // Send answer back to the offer sender
                        senderId: myClientId
                    }));
                    addRemoteVideo(offerSenderId, null); // Add placeholder for video element
                } catch (error) { console.error(`Error handling offer from ${offerSenderId}:`, error); }
            }
            break;
        case 'answer_received':
            const answerSenderId = message.senderId;
            if (answerSenderId === myClientId) return;

            const pcForAnswer = peerConnections[answerSenderId];
            if (pcForAnswer && !pcForAnswer.currentRemoteDescription) { // Only if not already set
                 try {
                    await pcForAnswer.setRemoteDescription(new RTCSessionDescription(message.answer));
                    callStatus.textContent = `Connected with ${answerSenderId.substring(0,5)}.`;
                 }
                 catch (error) { console.error(`Error handling answer from ${answerSenderId}:`, error);}
            }
            break;
        case 'candidate_received':
            const candidateSenderId = message.senderId;
            const pcForCandidate = peerConnections[candidateSenderId];
            if (pcForCandidate && message.candidate && pcForCandidate.signalingState !== 'closed') {
                try { await pcForCandidate.addIceCandidate(new RTCIceCandidate(message.candidate)); }
                catch (e) { console.error(`Error adding ICE candidate from ${candidateSenderId}:`, e); }
            }
            break;
        case 'peer_left':
            const leftPeerId = message.leftPeerId;
            callStatus.textContent = `Peer ${leftPeerId.substring(0,5)} left.`;
            displayChatMessage(`User ${leftPeerId.substring(0,5)} left.`, false, 'System');
            if (peerConnections[leftPeerId]) {
                peerConnections[leftPeerId].close();
                delete peerConnections[leftPeerId];
            }
            removeRemoteVideo(leftPeerId);
            updateVideoLayout();
            break;
        case 'chat_message_received':
            displayChatMessage(message.text, false, message.senderId ? message.senderId.substring(0,5) : "Peer");
            break;
        case 'error':
            console.error("Error from server:", message.message);
            callStatus.textContent = "Server Error: " + message.message;
            if (message.message.includes("Room is full") || message.message.includes("Room does not exist")) {
                endCurrentCall(false);
            }
            break;
        default:
            console.log("Unknown message type received:", message.type);
    }
};

socket.onerror = (error) => {
    console.error("WebSocket error:", error);
    callStatus.textContent = "Connection error. Please refresh.";
    showCallInterface(false);
};

socket.onclose = () => {
    console.log("WebSocket connection closed.");
    if (currentRoomId) {
        callStatus.textContent = "Connection lost. Call ended.";
        endCurrentCall(false);
    } else {
        callStatus.textContent = "Disconnected. Please refresh.";
    }
    showCallInterface(false);
    myClientIdDisplay.textContent = "N/A";
};

// --- Call Controls ---
function toggleMute() {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !isAudioMuted; });
    muteButton.innerHTML = isAudioMuted ? micOffIcon : micOnIcon;
    muteButton.title = isAudioMuted ? "Unmute Audio" : "Mute Audio";
}

function toggleVideo() {
    if (!localStream) return;
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => { track.enabled = !isVideoOff; });
    toggleVideoButton.innerHTML = isVideoOff ? videoOffIcon : videoOnIcon;
    toggleVideoButton.title = isVideoOff ? "Show Video" : "Hide Video";
    localVideo.style.visibility = isVideoOff ? 'hidden' : 'visible';
}

// --- Chat Functionality ---
function sendChatMessage() {
    const text = chatInput.value.trim();
    if (text && currentRoomId && myClientId && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat_message',
            roomId: currentRoomId,
            senderId: myClientId,
            text: text
        }));
        displayChatMessage(text, true);
        chatInput.value = "";
    }
}

function displayChatMessage(text, isLocal, senderDisplayName = "Peer") {
    const messageElement = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = isLocal ? "You: " : `${senderDisplayName}: `;
    
    messageElement.appendChild(strong);
    messageElement.appendChild(document.createTextNode(text));
    messageElement.classList.add(isLocal ? 'local-message' : 'remote-message');
    if (senderDisplayName === 'System') { // For system messages like join/leave
        messageElement.classList.remove('local-message', 'remote-message');
        messageElement.classList.add('system-message');
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Dynamic Video Layout ---
function addRemoteVideo(peerId, stream) {
    if (document.getElementById(`video-container-${peerId}`)) { // If container exists
        const videoEl = document.getElementById(`video-${peerId}`);
        if (videoEl && stream) videoEl.srcObject = stream; // Just update stream
        return;
    }

    const videoContainer = document.createElement('div');
    videoContainer.id = `video-container-${peerId}`;
    videoContainer.className = 'video-participant-wrapper';

    const videoEl = document.createElement('video');
    videoEl.id = `video-${peerId}`;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    if (stream) videoEl.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `User: ${peerId ? peerId.substring(0, 5) : 'Unknown'}`;

    videoContainer.appendChild(videoEl);
    videoContainer.appendChild(label);
    remoteVideosContainer.appendChild(videoContainer);
    updateVideoLayout();
}

function removeRemoteVideo(peerId) {
    const videoContainer = document.getElementById(`video-container-${peerId}`);
    if (videoContainer) {
        remoteVideosContainer.removeChild(videoContainer);
    }
    updateVideoLayout();
}

function updateVideoLayout() {
    const count = remoteVideosContainer.children.length;
    let cols = 1;
    if (count > 1) cols = 2;
    if (count > 4) cols = 3; // Example: for 5-9 videos, use 3 columns
    if (count > 9) cols = 4; // Example: for 10+ videos, use 4 columns
    
    remoteVideosContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // Adjust aspect ratio or size of individual items if needed
    Array.from(remoteVideosContainer.children).forEach(child => {
        if (count === 1) {
            child.style.aspectRatio = 'unset'; // Let it fill
        } else {
            child.style.aspectRatio = '16 / 9'; // Maintain aspect ratio for grid items
        }
    });
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    showCallInterface(false);
    callStatus.textContent = "Connecting...";
    muteButton.innerHTML = micOnIcon;
    toggleVideoButton.innerHTML = videoOnIcon;
    // End call SVG is static in HTML
    updateVideoDeviceList().catch(e => console.error("Error on initial device enumeration:", e));
});