const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const MAX_PLAYERS = 8;
const MAP_SIZE = 2400;

function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }

    } while (rooms.has(code));

    return code;
}

function createRoom() {
    const code = makeRoomCode();

    const room = {
        code,
        state: "waiting",

        players: new Map(),

        safeRadius: 1000,

        startTime: null,
        winner: null
    };

    rooms.set(code, room);

    return room;
}

function randomSpawn() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 500 + Math.random() * 300;

    return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance
    };
}

function publicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        health: player.health,
        score: player.score,
        alive: player.alive
    };
}

function broadcastRoom(room) {

    const players = [];

    for (const player of room.players.values()) {
        players.push(publicPlayer(player));
    }

    io.to(room.code).emit("state", {
        state: room.state,
        players,
        safeRadius: room.safeRadius,
        winner: room.winner
    });
}

io.on("connection", socket => {

    console.log("Connected:", socket.id);

    socket.on("createRoom", ({ name }) => {

        const room = createRoom();

        const spawn = randomSpawn();

        const player = {
            id: socket.id,
            name: String(name || "Player").slice(0, 16),

            x: spawn.x,
            y: spawn.y,

            health: 100,
            score: 0,

            alive: true,

            input: {
                up: false,
                down: false,
                left: false,
                right: false
            }
        };

        room.players.set(socket.id, player);

        socket.join(room.code);

        socket.roomCode = room.code;

        socket.emit("roomCreated", {
            code: room.code
        });

        broadcastRoom(room);
    });

    socket.on("joinRoom", ({ code, name }) => {

        code = String(code || "").toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            socket.emit("errorMessage", "Room not found.");
            return;
        }

        if (room.players.size >= MAX_PLAYERS) {
            socket.emit("errorMessage", "Room is full.");
            return;
        }

        if (room.state !== "waiting") {
            socket.emit("errorMessage", "Game already started.");
            return;
        }

        const spawn = randomSpawn();

        const player = {
            id: socket.id,
            name: String(name || "Player").slice(0, 16),

            x: spawn.x,
            y: spawn.y,

            health: 100,
            score: 0,

            alive: true,

            input: {
                up: false,
                down: false,
                left: false,
                right: false
            }
        };

        room.players.set(socket.id, player);

        socket.join(room.code);

        socket.roomCode = room.code;

        socket.emit("joinedRoom", {
            code: room.code
        });

        broadcastRoom(room);
    });

    socket.on("startGame", () => {

        const room = rooms.get(socket.roomCode);

        if (!room) return;

        if (room.state !== "waiting") return;

        if (room.players.size < 2) {
            socket.emit(
                "errorMessage",
                "You need at least 2 players."
            );

            return;
        }

        room.state = "playing";
        room.startTime = Date.now();

        io.to(room.code).emit("gameStarted");

        broadcastRoom(room);
    });

    socket.on("input", input => {

        const room = rooms.get(socket.roomCode);

        if (!room) return;

        const player = room.players.get(socket.id);

        if (!player) return;

        if (!player.alive) return;

        player.input.up = !!input.up;
        player.input.down = !!input.down;
        player.input.left = !!input.left;
        player.input.right = !!input.right;
    });

    socket.on("disconnect", () => {

        const room = rooms.get(socket.roomCode);

        if (!room) return;

        room.players.delete(socket.id);

        if (room.players.size === 0) {
            rooms.delete(room.code);
            return;
        }

        broadcastRoom(room);
    });
});
const TICK_RATE = 30;
const SPEED = 6;

setInterval(() => {

    for (const room of rooms.values()) {

        if (room.state !== "playing") {
            continue;
        }

        updateRoom(room);

        broadcastRoom(room);
    }

}, 1000 / TICK_RATE);
function updateRoom(room) {

    const elapsed =
        (Date.now() - room.startTime) / 1000;

    // Shrink the safe area over time.
    room.safeRadius = Math.max(
        150,
        1000 - elapsed * 10
    );

    for (const player of room.players.values()) {

        if (!player.alive) continue;

        let dx = 0;
        let dy = 0;

        if (player.input.up) dy -= 1;
        if (player.input.down) dy += 1;
        if (player.input.left) dx -= 1;
        if (player.input.right) dx += 1;

        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
            dx /= length;
            dy /= length;
        }

        player.x += dx * SPEED;
        player.y += dy * SPEED;

        const distance =
            Math.sqrt(
                player.x * player.x +
                player.y * player.y
            );

        // Outside safe zone.
        if (distance > room.safeRadius) {

            player.health -= 0.8;

            if (player.health <= 0) {
                player.health = 0;
                player.alive = false;
            }
        }
    }

    checkPlayerCollisions(room);

    checkWinner(room);
}
function checkPlayerCollisions(room) {

    const players = [...room.players.values()];

    for (let i = 0; i < players.length; i++) {

        for (let j = i + 1; j < players.length; j++) {

            const a = players[i];
            const b = players[j];

            if (!a.alive || !b.alive) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;

            const distance =
                Math.sqrt(dx * dx + dy * dy);

            if (distance < 45) {

                const nx = distance === 0
                    ? 1
                    : dx / distance;

                const ny = distance === 0
                    ? 0
                    : dy / distance;

                // Push players apart.
                a.x -= nx * 8;
                a.y -= ny * 8;

                b.x += nx * 8;
                b.y += ny * 8;

                // Small energy transfer.
                a.health -= 2;
                b.health -= 2;

                if (a.health <= 0) {
                    a.health = 0;
                    a.alive = false;
                }

                if (b.health <= 0) {
                    b.health = 0;
                    b.alive = false;
                }
            }
        }
    }
}
function checkWinner(room) {

    const alivePlayers =
        [...room.players.values()]
            .filter(player => player.alive);

    if (alivePlayers.length <= 1) {

        room.state = "finished";

        if (alivePlayers.length === 1) {
            room.winner = alivePlayers[0].name;
        }

        io.to(room.code).emit("gameFinished", {
            winner: room.winner
        });
    }
}
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
