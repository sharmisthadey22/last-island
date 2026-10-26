const socket = io();

const menu = document.getElementById("menu");
const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const hud = document.getElementById("hud");

const ctx = game.getContext("2d");

const nameInput = document.getElementById("name");
const roomInput = document.getElementById("room");

const message = document.getElementById("message");

const roomCode = document.getElementById("roomCode");
const playerList = document.getElementById("playerList");

let players = [];
let safeRadius = 1000;
let gameState = "waiting";

function resize() {

    game.width = window.innerWidth;
    game.height = window.innerHeight;
}
// Create a room
window.addEventListener("resize", resize);

resize();
document.getElementById("create")
    .addEventListener("click", () => {

        const name =
            nameInput.value.trim() || "Player";

        socket.emit("createRoom", {
            name
        });
    });
    // Join a room
    document.getElementById("join")
    .addEventListener("click", () => {

        const name =
            nameInput.value.trim() || "Player";

        const code =
            roomInput.value.trim().toUpperCase();

        socket.emit("joinRoom", {
            name,
            code
        });
    });
    // Show the lobby when created a room
    socket.on("roomCreated", data => {

    showLobby(data.code);
});
// Show the lobby when joined a room
socket.on("joinedRoom", data => {

    showLobby(data.code);
});
// Show the lobby
function showLobby(code) {

    menu.hidden = true;
    lobby.hidden = false;

    roomCode.textContent = code;
}
// Receive game state from the server
socket.on("state", data => {

    players = data.players;

    safeRadius = data.safeRadius;

    gameState = data.state;

    updateLobby();

    updateHUD();
});
// Update the player list in the lobby
function updateLobby() {

    playerList.innerHTML = "";

    players.forEach(player => {

        const div =
            document.createElement("div");

        div.className = "player";

        div.textContent =
            `${player.name} ${player.alive ? "✓" : "☠"}`;

        playerList.appendChild(div);
    });
}
// Start game button
document.getElementById("start")
    .addEventListener("click", () => {

        socket.emit("startGame");
    });
    socket.on("gameStarted", () => {

    lobby.hidden = true;
    hud.hidden = false;

    game.focus();

    requestAnimationFrame(render);
});
const keys = {
    up: false,
    down: false,
    left: false,
    right: false
};
// Handle keyboard input
window.addEventListener("keydown", event => {

    if (
        event.key === "ArrowUp" ||
        event.key.toLowerCase() === "w"
    ) {
        keys.up = true;
    }

    if (
        event.key === "ArrowDown" ||
        event.key.toLowerCase() === "s"
    ) {
        keys.down = true;
    }

    if (
        event.key === "ArrowLeft" ||
        event.key.toLowerCase() === "a"
    ) {
        keys.left = true;
    }

    if (
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "d"
    ) {
        keys.right = true;
    }

    sendInput();
});

window.addEventListener("keyup", event => {

    if (
        event.key === "ArrowUp" ||
        event.key.toLowerCase() === "w"
    ) {
        keys.up = false;
    }

    if (
        event.key === "ArrowDown" ||
        event.key.toLowerCase() === "s"
    ) {
        keys.down = false;
    }

    if (
        event.key === "ArrowLeft" ||
        event.key.toLowerCase() === "a"
    ) {
        keys.left = false;
    }

    if (
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "d"
    ) {
        keys.right = false;
    }

    sendInput();
});
// Send input to the server
function sendInput() {

    socket.emit("input", keys);
}
// Render the game
function render() {

    ctx.clearRect(
        0,
        0,
        game.width,
        game.height
    );

    const me =
        players.find(
            player => player.id === socket.id
        );

    if (!me) {
        requestAnimationFrame(render);
        return;
    }

    const cameraX =
        me.x - game.width / 2;

    const cameraY =
        me.y - game.height / 2;

    drawWorld(cameraX, cameraY);

    players.forEach(player => {

        drawPlayer(
            player,
            cameraX,
            cameraY
        );
    });

    requestAnimationFrame(render);
}
// Draw the world
function drawWorld(cameraX, cameraY) {

    ctx.fillStyle = "#79b85b";

    ctx.fillRect(
        0,
        0,
        game.width,
        game.height
    );

    const centerX =
        -cameraX;

    const centerY =
        -cameraY;

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        safeRadius,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        "rgba(80,180,255,0.12)";

    ctx.fill();

    ctx.strokeStyle =
        "rgba(255,255,255,0.8)";

    ctx.lineWidth = 4;

    ctx.stroke();
}
// Draw a player
function drawPlayer(
    player,
    cameraX,
    cameraY
) {

    const x =
        player.x - cameraX;

    const y =
        player.y - cameraY;

    ctx.beginPath();

    ctx.arc(
        x,
        y,
        20,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        player.id === socket.id
            ? "#ffd166"
            : "#ff6b6b";

    ctx.fill();

    // Health bar

    ctx.fillStyle = "#222";

    ctx.fillRect(
        x - 25,
        y - 35,
        50,
        6
    );

    ctx.fillStyle = "#4ade80";

    ctx.fillRect(
        x - 25,
        y - 35,
        50 * (player.health / 100),
        6
    );

    // Name

    ctx.fillStyle = "white";

    ctx.font = "13px Arial";

    ctx.textAlign = "center";

    ctx.fillText(
        player.name,
        x,
        y + 42
    );
}
// Update HUD
function updateHUD() {

    document.getElementById(
        "playerCount"
    ).textContent = players.length;

    document.getElementById(
        "zoneSize"
    ).textContent =
        Math.round(safeRadius);
}
// Error 
socket.on("errorMessage", text => {

    message.textContent = text;
});
//winner 
socket.on("gameFinished", data => {

    setTimeout(() => {

        alert(
            data.winner
                ? `${data.winner} wins!`
                : "Draw!"
        );

        location.reload();

    }, 300);
});