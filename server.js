// server.js
const http = require('http');
const fs =require('fs');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // For generating unique client IDs

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const httpServer = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end("<h1>404 Not Found</h1>", 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server: httpServer });
const rooms = {}; // { roomId: [wsClient1, wsClient2, ...], ... }
const clients = new Map(); // Store ws -> clientId mapping

console.log(`Server running on ${HOST}:${PORT}`);

wss.on('connection', ws => {
    const clientId = uuidv4(); // Assign a unique ID to this client
    clients.set(ws, clientId);
    ws.clientId = clientId; // Attach ID to ws object for convenience
    ws.currentRoomId = null; // Track current room for the client

    console.log(`Client ${clientId} connected.`);
    ws.send(JSON.stringify({ type: 'client_id_assigned', clientId: clientId }));

    ws.on('message', messageString => {
        let message;
        try {
            message = JSON.parse(messageString);
        } catch (e) {
            console.error(`Failed to parse message from ${ws.clientId}:`, messageString, e);
            return;
        }

        console.log(`Msg from ${ws.clientId} in room ${ws.currentRoomId || 'N/A'}: ${message.type}`);

        switch (message.type) {
            case 'create_room':
                const roomId = message.roomId;
                if (!rooms[roomId]) {
                    rooms[roomId] = [ws];
                    ws.currentRoomId = roomId;
                    console.log(`Room ${roomId} created by ${ws.clientId}.`);
                    ws.send(JSON.stringify({ type: 'room_created_ack', roomId: roomId, clientId: ws.clientId }));
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
                }
                break;

            case 'join_room':
                const joinRoomId = message.roomId;
                if (rooms[joinRoomId]) {
                    const roomPeers = rooms[joinRoomId];
                    // Optional: Add room size limit here if desired
                    // if (roomPeers.length >= MAX_PEERS_PER_ROOM) {
                    //     ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                    //     return;
                    // }

                    // Notify existing peers about the new joiner
                    roomPeers.forEach(peerWs => {
                        if (peerWs.readyState === WebSocket.OPEN) {
                            peerWs.send(JSON.stringify({ type: 'peer_joined', newPeerId: ws.clientId, roomId: joinRoomId }));
                        }
                    });

                    // Add new client to room and inform them of existing peers
                    rooms[joinRoomId].push(ws);
                    ws.currentRoomId = joinRoomId;
                    const peerIds = roomPeers.map(peerWs => peerWs.clientId);
                    ws.send(JSON.stringify({ type: 'joined_room_ack', roomId: joinRoomId, peers: peerIds }));
                    console.log(`Client ${ws.clientId} joined room ${joinRoomId}. Peers in room: ${peerIds.length + 1}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room does not exist' }));
                }
                break;

            // Signaling: offer, answer, candidate
            case 'offer':
            case 'answer':
            case 'candidate':
                const targetId = message.targetId;
                const senderId = message.senderId; // Should be ws.clientId
                const currentRoom = rooms[ws.currentRoomId];

                if (currentRoom) {
                    const targetWs = currentRoom.find(clientWs => clientWs.clientId === targetId);
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        const typeToRelay = message.type === 'offer' ? 'offer_received' :
                                            message.type === 'answer' ? 'answer_received' :
                                            'candidate_received';
                        targetWs.send(JSON.stringify({
                            ...message, // Includes original offer/answer/candidate
                            type: typeToRelay,
                            senderId: ws.clientId // Explicitly set sender from server-side ws object
                        }));
                        // console.log(`Relayed ${message.type} from ${ws.clientId} to ${targetId} in room ${ws.currentRoomId}`);
                    } else {
                        console.log(`Target client ${targetId} not found or not open in room ${ws.currentRoomId} for ${message.type}`);
                    }
                } else {
                    console.log(`Room ${ws.currentRoomId} not found for ${message.type} from ${ws.clientId}`);
                }
                break;

            case 'chat_message':
                const chatRoomId = message.roomId; // Room ID from message
                const chatSenderId = message.senderId; // Sender ID from message (should match ws.clientId)
                if (rooms[chatRoomId]) {
                    rooms[chatRoomId].forEach(clientWs => {
                        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'chat_message_received',
                                text: message.text,
                                senderId: ws.clientId // Use server-verified senderId
                            }));
                        }
                    });
                    // console.log(`Chat from ${ws.clientId} in room ${chatRoomId}: ${message.text}`);
                }
                break;

            case 'leave_room':
                handleClientDisconnect(ws);
                break;
            
            default:
                console.log(`Received unhandled message type: ${message.type} from ${ws.clientId}`);
        }
    });

    function handleClientDisconnect(wsInstance) {
        const roomId = wsInstance.currentRoomId;
        const clientId = wsInstance.clientId;
        clients.delete(wsInstance); // Remove from global client map
        console.log(`Client ${clientId} disconnected or left room ${roomId}.`);

        if (roomId && rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter(clientWs => clientWs !== wsInstance);
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} is empty and removed.`);
            } else {
                // Notify remaining peers
                rooms[roomId].forEach(peerWs => {
                    if (peerWs.readyState === WebSocket.OPEN) {
                        peerWs.send(JSON.stringify({ type: 'peer_left', leftPeerId: clientId, roomId: roomId }));
                    }
                });
                console.log(`Notified peers in room ${roomId} about ${clientId} leaving.`);
            }
        }
        wsInstance.currentRoomId = null; // Clear room association
    }

    ws.on('close', () => handleClientDisconnect(ws));
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.clientId}:`, error);
        handleClientDisconnect(ws); // Treat error as a disconnect for cleanup
    });
});

httpServer.listen(PORT, HOST, () => {
    console.log(`Server is listening on ${HOST}:${PORT}`);
    // Network interface logging remains the same
    if (process.env.NODE_ENV !== 'production' || HOST === '0.0.0.0') {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        console.log("Access from local network via:");
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`  Interface ${name}: http://${net.address}:${PORT}`);
                }
            }
        }
    }
});

// Need to install uuid: npm install uuid