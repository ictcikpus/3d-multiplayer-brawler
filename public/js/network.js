let socket;

function initNetworkModule() {
    // Otomatis mengenali apakah berjalan di localhost atau server seperti Render.com
    socket = io();

    // Menerima daftar player yang sudah ada
    socket.on('currentPlayers', (serverPlayers) => {
        Object.keys(serverPlayers).forEach((id) => {
            if (id !== socket.id) {
                spawnRemotePlayer(serverPlayers[id]);
            }
        });
    });

    // Menerima penentuan data lokal dari server (misal tim)
    socket.on('playerAssigned', (data) => {
        if (localPlayerData) {
            localPlayerData.team = data.team;
        }
    });

    // Player baru masuk
    socket.on('newPlayer', (playerData) => {
        spawnRemotePlayer(playerData);
    });

    // Pergerakan player lain
    socket.on('playerMoved', (playerData) => {
        updateRemotePlayerPosition(playerData);
    });

    // Player lain menyerang/panggil skill
    socket.on('remoteAction', (data) => {
        triggerRemoteVisualEffect(data.id, data.action);
    });

    // Player lain terputus
    socket.on('playerDisconnected', (id) => {
        removeRemotePlayer(id);
    });
}

// Mengirimkan posisi lokal ke server
function sendLocalMovement(x, z, rotation) {
    if (socket && socket.connected) {
        socket.emit('playerMove', { x, z, rotation });
    }
}

// Mengirim aksi skill/serangan ke server
function sendLocalAction(actionType) {
    if (socket && socket.connected) {
        socket.emit('playerAction', { action: actionType });
    }
}
