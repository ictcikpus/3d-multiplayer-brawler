// Data Konfigurasi Hero
const HERO_CONFIG = {
    vanguard: { color: 0x00f0ff, scale: 1.3, speed: 0.12 },
    striker:  { color: 0xff2a6d, scale: 1.0, speed: 0.20 },
    support:  { color: 0x05ffa1, scale: 0.9, speed: 0.15 }
};

let scene, camera, renderer;
let localPlayerMesh = null;
let localPlayerData = null;
const remotePlayers = {}; // Menyimpan Mesh player lain
const remoteTargets = {}; // Digunakan untuk interpolasi/lerp posisi agar tidak patah-patah
const keys = {};
let moveVector = { x: 0, z: 0 };

// --- INISIALISASI GAME ---
function initEngine() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c16);
    scene.fog = new THREE.FogExp2(0x0a0c16, 0.02);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 18);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Pencahayaan
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    buildArena();

    // Event Listener
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    setupMobileControls();
}

// --- ARENA ---
function buildArena() {
    const groundGeo = new THREE.CylinderGeometry(25, 25, 1, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.4 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(50, 20, 0x00f0ff, 0x1f293d);
    grid.position.y = 0.01;
    scene.add(grid);
}

// --- SPAWN PLAYER LOKAL ---
function selectHero(heroType) {
    document.getElementById('hero-select-modal').style.display = 'none';
    
    initEngine();
    initNetworkModule();

    const config = HERO_CONFIG[heroType];
    const geo = new THREE.CapsuleGeometry(0.5 * config.scale, 1 * config.scale, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.3 });

    localPlayerMesh = new THREE.Mesh(geo, mat);
    localPlayerMesh.position.set(0, 1 * config.scale, 0);
    localPlayerMesh.castShadow = true;
    scene.add(localPlayerMesh);

    localPlayerData = { hero: heroType, speed: config.speed };

    // Kirim permintaan spawn ke server
    socket.emit('spawnPlayer', { hero: heroType });

    animate();
}

// --- SPAWN PLAYER LAIN (REMOTE) ---
function spawnRemotePlayer(data) {
    if (remotePlayers[data.id]) return;

    const config = HERO_CONFIG[data.hero];
    const geo = new THREE.CapsuleGeometry(0.5 * config.scale, 1 * config.scale, 4, 8);
    
    // Pembeda Warna Tim (Blue / Red)
    const teamColor = data.team === 'blue' ? 0x00f0ff : 0xff2a6d;
    const mat = new THREE.MeshStandardMaterial({ color: teamColor });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, 1 * config.scale, data.z);
    mesh.castShadow = true;
    scene.add(mesh);

    remotePlayers[data.id] = mesh;
    remoteTargets[data.id] = { x: data.x, z: data.z };
}

function updateRemotePlayerPosition(data) {
    if (remoteTargets[data.id]) {
        remoteTargets[data.id].x = data.x;
        remoteTargets[data.id].z = data.z;
    }
}

function removeRemotePlayer(id) {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id]);
        delete remotePlayers[id];
        delete remoteTargets[id];
    }
}

function triggerRemoteVisualEffect(id, actionType) {
    const mesh = remotePlayers[id];
    if (mesh) {
        // Efek Visual Sederhana (Flash Putih)
        mesh.material.color.setHex(0xffffff);
        setTimeout(() => {
            mesh.material.color.setHex(HERO_CONFIG[mesh.hero || 'striker'].color);
        }, 150);
    }
}

// --- INPUT & MOVEMENT LOGIC ---
function updateLocalPlayer() {
    if (!localPlayerMesh) return;

    let dx = moveVector.x;
    let dz = moveVector.z;

    if (keys['w'] || keys['arrowup']) dz = -1;
    if (keys['s'] || keys['arrowdown']) dz = 1;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;

    if (dx !== 0 && dz !== 0) {
        dx *= 0.7071;
        dz *= 0.7071;
    }

    const speed = localPlayerData.speed;
    localPlayerMesh.position.x += dx * speed;
    localPlayerMesh.position.z += dz * speed;

    // Pembatas Area Bertarung (Radius 23m)
    const dist = Math.hypot(localPlayerMesh.position.x, localPlayerMesh.position.z);
    if (dist > 23) {
        const angle = Math.atan2(localPlayerMesh.position.z, localPlayerMesh.position.x);
        localPlayerMesh.position.x = Math.cos(angle) * 23;
        localPlayerMesh.position.z = Math.sin(angle) * 23;
    }

    // Kamera mengikuti player
    camera.position.x = localPlayerMesh.position.x;
    camera.position.z = localPlayerMesh.position.z + 18;
    camera.lookAt(localPlayerMesh.position);

    // Kirim posisi jika bergerak
    if (dx !== 0 || dz !== 0) {
        sendLocalMovement(localPlayerMesh.position.x, localPlayerMesh.position.z, localPlayerMesh.rotation.y);
    }
}

// --- INTERPOLASI (LERP) UNTUK PLAYER LAIN ---
function interpolateRemotePlayers() {
    Object.keys(remotePlayers).forEach((id) => {
        const mesh = remotePlayers[id];
        const target = remoteTargets[id];
        if (mesh && target) {
            // Perataan posisi (Lerp Factor 0.2 untuk gerakan halus)
            mesh.position.x += (target.x - mesh.position.x) * 0.2;
            mesh.position.z += (target.z - mesh.position.z) * 0.2;
        }
    });
}

// --- CONTROLS JOYSTICK MOBILE ---
function setupMobileControls() {
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('knob');
    let active = false;

    const handleMove = (e) => {
        if (!active) return;
        const touch = e.touches ? e.touches[0] : e;
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let deltaX = touch.clientX - centerX;
        let deltaY = touch.clientY - centerY;
        const dist = Math.hypot(deltaX, deltaY);
        const maxDist = rect.width / 2;

        if (dist > maxDist) {
            deltaX = (deltaX / dist) * maxDist;
            deltaY = (deltaY / dist) * maxDist;
        }

        knob.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        moveVector.x = deltaX / maxDist;
        moveVector.z = deltaY / maxDist;
    };

    const handleEnd = () => {
        active = false;
        knob.style.transform = `translate(0, 0)`;
        moveVector.x = 0;
        moveVector.z = 0;
    };

    joystick.addEventListener('touchstart', (e) => { active = true; handleMove(e); });
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    document.getElementById('btn-attack').addEventListener('click', () => sendLocalAction('attack'));
    document.getElementById('btn-skill').addEventListener('click', () => sendLocalAction('skill'));
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- GAME LOOP ---
function animate() {
    requestAnimationFrame(animate);
    updateLocalPlayer();
    interpolateRemotePlayers();
    renderer.render(scene, camera);
}
