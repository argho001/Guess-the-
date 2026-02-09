const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
app.use(cors());

// Serve static client
app.use(express.static(require('path').join(__dirname, '../client')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Room state in-memory
const rooms = new Map();

const CHAR_SETS = {
  bd_politics: [],
  naruto: [],
  onepiece: [],
  classic: [],
};

// Populate BD Politics characters
CHAR_SETS.bd_politics = [
  { name: 'মির্জা আব্বাস', img: '/neta_images/abbas.jpg' },
  { name: 'আমান উল্লাহ আমান', img: '/neta_images/aman.png' },
  { name: 'লুৎফুজ্জামান বাবর', img: '/neta_images/babor.png' },
  { name: 'ববি হাজ্জাজ', img: '/neta_images/bobby.jpg' },
  { name: 'মির্জা ফখরুল', img: '/neta_images/fakhrul.jpg' },
  { name: 'হাবিবুর রশিদ', img: '/neta_images/habibur-rashid.jpg' },
  { name: 'হাসনাত আবদুল্লাহ', img: '/neta_images/hasnat.jpg' },
  { name: 'ইশরাক হোসেন', img: '/neta_images/ishraque.jpg' },
  { name: 'মামুনুল হক', img: '/neta_images/mamum.jpg' },
  { name: 'নাহিদ ইসলাম', img: '/neta_images/nahid.jpg' },
  { name: 'আন্দালিব রহমান পার্থ', img: '/neta_images/partho.png' },
  { name: 'নাসিরুদ্দিন পাটোয়ারী', img: '/neta_images/patowari.jpg' },
  { name: 'রুহুল কবির রিজভী', img: '/neta_images/ruhul.jpg' },
  { name: 'রুমিন ফারহানা', img: '/neta_images/rumeen.jpg' },
  { name: 'সারজিস আলম', img: '/neta_images/sarjis.jpg' },
  { name: 'শফিকুর রহমান', img: '/neta_images/shafique.jpg' },
  { name: 'তারেক রহমান', img: '/neta_images/tarek.jpg' },
  { name: 'তাসনিম জারা', img: '/neta_images/tasnim.jpg' },
];

function createCharacters(theme = 'bd_politics') {
  // Force BD Politics theme
  theme = 'bd_politics';

  const fullSet = CHAR_SETS[theme];

  // Shuffle and pick 18 characters
  const shuffled = [...fullSet].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 18);

  return selected.map((c, i) => ({
    id: `c${i + 1}`,
    name: c.name,
    image: c.img,
  }));
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    out += chars[idx];
  }
  return out;
}

function createRoom(theme = 'bd_politics') {
  const code = randomCode(6);
  const room = {
    code,
    theme: 'bd_politics',
    players: {},
    playerOrder: [],
    board: createCharacters('bd_politics'),
    phase: 'selecting',
    currentTurn: null,
    winner: null,
    lastTwoGuesses: [],
    chat: [],
    creatorId: null,
    commMode: 'chat',
  };
  rooms.set(code, room);
  return room;
}

function getOpponent(room, socketId) {
  return room.playerOrder.find((id) => id !== socketId) || null;
}

function startGameIfReady(room) {
  const bothSelected =
    room.playerOrder.length === 2 &&
    room.playerOrder.every((id) => room.players[id]?.secretId);
  if (bothSelected && room.phase === 'selecting') {
    room.phase = 'playing';
    room.currentTurn =
      Math.random() < 0.5 ? room.playerOrder[0] : room.playerOrder[1];
  }
}

function checkDraw(room) {
  if (room.lastTwoGuesses.length >= 2) {
    const last = room.lastTwoGuesses.slice(-2);
    const bothCorrect = last.every((g) => g.correct);
    const bothWrong = last.every((g) => !g.correct);
    if (bothCorrect || bothWrong) {
      room.phase = 'finished';
      room.winner = 'draw';
      return true;
    }
  }
  return false;
}

// Helper to send personalized state to EACH player in the room
function broadcastRoomState(code) {
  const room = rooms.get(code);
  if (!room) return;

  // Get all sockets in the room
  io.in(code).fetchSockets().then((sockets) => {
    sockets.forEach((socket) => {
      socket.emit('roomState', serializeRoomFor(socket.id, room));
    });
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ theme }, cb) => {
    const room = createRoom(theme);
    cb({ code: room.code });
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) {
      cb({ ok: false, error: 'Room not found' });
      return;
    }
    if (room.playerOrder.length >= 2) {
      cb({ ok: false, error: 'Room is full' });
      return;
    }
    room.players[socket.id] = {
      id: socket.id,
      name: name || `Player ${room.playerOrder.length + 1}`,
      crossed: new Set(),
      secretId: null,
    };
    room.playerOrder.push(socket.id);
    if (!room.creatorId) room.creatorId = socket.id;
    socket.join(code);

    // Broadcast correctly to everyone
    broadcastRoomState(code);

    // Send shuffled board to client so players have different layouts
    const clientBoard = [...room.board].sort(() => 0.5 - Math.random());
    cb({ ok: true, board: clientBoard, you: socket.id, theme: room.theme });
  });

  socket.on('selectSecret', ({ code, characterId }) => {
    const room = rooms.get(code);
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].secretId = characterId;
    startGameIfReady(room);
    broadcastRoomState(code);
  });

  socket.on('sendChat', ({ code, text }) => {
    const room = rooms.get(code);
    if (!room) return;
    const msg = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      from: socket.id,
      text: String(text || '').slice(0, 500),
      ts: Date.now(),
    };
    room.chat.push(msg);
    io.to(code).emit('chatMessage', msg);
  });

  socket.on('answerYesNo', ({ code, answer }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing') return;
    const opponent = getOpponent(room, socket.id);
    if (socket.id === room.currentTurn) return;
    const text = answer ? 'YES' : 'NO';
    const msg = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      from: socket.id,
      text: `Answer: ${text}`,
      ts: Date.now(),
    };
    room.chat.push(msg);

    // Store answer for draw check
    room.lastTwoGuesses.push({ playerId: socket.id, correct: false }); // Answers aren't guesses, logic is simplified

    io.to(code).emit('chatMessage', msg);
    room.currentTurn = opponent; // Keep turn passing logic
    broadcastRoomState(code); // Broadcast state after turn change
  });

  socket.on('updateCrossed', ({ code, characterId }) => {
    const room = rooms.get(code);
    if (!room || !room.players[socket.id]) return;
    const crossed = room.players[socket.id].crossed;
    if (crossed.has(characterId)) crossed.delete(characterId);
    else crossed.add(characterId);
    socket.emit('yourCrossed', Array.from(crossed));
  });

  socket.on('guessCharacter', ({ code, characterId }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing') return;
    if (socket.id !== room.currentTurn) return;
    const opponent = getOpponent(room, socket.id);
    if (!opponent) return;

    const opponentSecret = room.players[opponent].secretId;
    const correct = characterId === opponentSecret;

    room.lastTwoGuesses.push({ playerId: socket.id, correct });

    if (correct) {
      const drew = checkDraw(room);
      if (!drew) {
        room.phase = 'finished';
        room.winner = socket.id;
      }
    } else {
      room.currentTurn = opponent;
      checkDraw(room);
      // Simplify logic: draw check might change phase.
    }
    broadcastRoomState(code);
  });

  socket.on('endTurn', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing') return;
    if (socket.id !== room.currentTurn) return;
    const opponent = getOpponent(room, socket.id);
    room.currentTurn = opponent;
    broadcastRoomState(code);
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        room.playerOrder = room.playerOrder.filter((id) => id !== socket.id);
        io.to(code).emit('roomState', serializeRoomFor(socket.id, room));
        if (room.playerOrder.length === 0) {
          rooms.delete(code);
        }
      }
    }
  });

  socket.on('requestCall', ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    const opponent = getOpponent(room, socket.id);
    if (opponent) {
      io.to(opponent).emit('incomingCall', { from: socket.id });
    }
  });

  socket.on('callAccepted', ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    const opponent = getOpponent(room, socket.id);
    if (opponent) {
      io.to(opponent).emit('callAccepted', { from: socket.id });
    }
  });

  socket.on('callDeclined', ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    const opponent = getOpponent(room, socket.id);
    if (opponent) {
      io.to(opponent).emit('callDeclined', { from: socket.id });
    }
  });

  socket.on('rtc-offer', ({ code, sdp }) => {
    console.log(`[Signal] Offer from ${socket.id} in room ${code}`);
    if (!rooms.get(code)) return;
    socket.to(code).emit('rtc-offer', { from: socket.id, sdp });
  });
  socket.on('rtc-answer', ({ code, sdp }) => {
    console.log(`[Signal] Answer from ${socket.id} in room ${code}`);
    if (!rooms.get(code)) return;
    socket.to(code).emit('rtc-answer', { from: socket.id, sdp });
  });
  socket.on('rtc-ice', ({ code, candidate }) => {
    console.log(`[Signal] ICE from ${socket.id} in room ${code}`);
    if (!rooms.get(code)) return;
    socket.to(code).emit('rtc-ice', { from: socket.id, candidate });
  });
  socket.on('endCall', ({ code }) => {
    if (!rooms.get(code)) return;
    socket.to(code).emit('endCall', { from: socket.id });
  });

  socket.on('setCommMode', ({ code, mode }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.creatorId) return;
    if (!['chat', 'video'].includes(mode)) return;
    room.commMode = mode;
  });
});

function serializeRoomFor(viewerId, room) {
  const players = room.playerOrder.map((id) => {
    const p = room.players[id];
    return {
      id: p.id,
      name: p.name,
      secretId: viewerId === id ? p.secretId : null,
    };
  });
  return {
    code: room.code,
    board: room.board,
    players,
    phase: room.phase,
    currentTurn: room.currentTurn,
    winner: room.winner,
    creatorId: room.creatorId,
    commMode: room.commMode,
  };
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
