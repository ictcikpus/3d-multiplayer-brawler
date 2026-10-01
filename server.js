const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// Menyimpan data semua pemain aktif
const players = {};

io.on('connection', (socket) => {
    console.log(`[CONNECT] Player terhubung: ${socket.id}`);

    // 1. Kirim data pemain yang sudah ada ke pemain baru
    socket.emit('currentPlayers', players);

    // 2. Event Spawn Player Baru
    socket.on('spawnPlayer', (data) => {
        // Pembagian tim otomatis (Tim A: blue, Tim B: red)
        const team = Object.keys(players).length % 2 === 0 ? 'blue' : 'red';
        
        players[socket.id] = {
            id: socket.id,
            x: (Math.random() - 0.5) * 10,
            z: (Math.random() - 0.5) * 10,
            rotation: 0,
            hero: data.hero,
            team: team,
            hp: data.hero === 'vanguard' ? 150 : data.hero === 'striker' ? 90 : 100
        };

        // Broadcast ke semua player lain
        socket.broadcast.emit('newPlayer', players[socket.id]);
        socket.emit('playerAssigned', players[socket.id]);
    });

    // 3. Update Posisi & Rotasi Player
    socket.on('playerMove', (moveData) => {
        if (players[socket.id]) {
            players[socket.id].x = moveData.x;
            players[socket.id].z = moveData.z;
            players[socket.id].rotation = moveData.rotation;
            
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 4. Event Aksi Attack / Skill
    socket.on('playerAction', (actionData) => {
        socket.broadcast.emit('remoteAction', {
            id: socket.id,
            action: actionData.action
        });
    });

    // 5. Player Disconnect
    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] Player keluar: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});
