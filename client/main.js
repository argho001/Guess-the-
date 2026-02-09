const socket = io();
const ui = {
  lobby: document.getElementById('lobby'),
  game: document.getElementById('game'),
  roomInfo: document.getElementById('roomInfo'),
  status: document.getElementById('status'),
  yourName: document.getElementById('yourName'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  joinCode: document.getElementById('joinCode'),
  board: document.getElementById('board'),
  mySecret: document.getElementById('mySecret'),
  endTurnBtn: document.getElementById('endTurnBtn'),
  guessModeBtn: document.getElementById('guessModeBtn'),
  chat: document.getElementById('chat'),
  messages: document.getElementById('messages'),
  chatInput: document.getElementById('chatInput'),
  sendChatBtn: document.getElementById('sendChatBtn'),
  answerYesBtn: document.getElementById('answerYesBtn'),
  answerNoBtn: document.getElementById('answerNoBtn'),
  startCallBtn: document.getElementById('startCallBtn'),
  endCallBtn: document.getElementById('endCallBtn'),
  muteMicBtn: document.getElementById('muteMicBtn'),
  muteCamBtn: document.getElementById('muteCamBtn'),
  fixAudioBtn: document.getElementById('fixAudioBtn'),
  localVideo: document.getElementById('localVideo'),
  remoteVideo: document.getElementById('remoteVideo'),
  modeChatBtn: document.getElementById('modeChatBtn'),
  modeVideoBtn: document.getElementById('modeVideoBtn'),
  videoPanel: document.getElementById('video'),
  localLabel: document.getElementById('localLabel'),
  remoteLabel: document.getElementById('remoteLabel'),
  gameEndModal: document.getElementById('gameEndModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalResult: document.getElementById('modalResult'),
  modalPlayers: document.getElementById('modalPlayers'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  turnReminder: document.getElementById('turnReminder'),
};

let state = {
  code: null,
  you: null,
  board: [],
  players: [],
  phase: 'selecting',
  currentTurn: null,
  winner: null,
  crossed: new Set(),
  guessMode: false,
  callActive: false,
  selectedTheme: 'bd_politics',
};

let turnTimer = null;

// Theme selection removed (Single Theme Enforced)

function setLobbyVisible(visible) {
  ui.lobby.classList.toggle('hidden', !visible);
  ui.game.classList.toggle('hidden', visible);
}

function updateStatus() {
  const me = state.players.find((p) => p.id === state.you);
  const parts = [];
  parts.push(`রুম: ${state.code || '...'}`);

  if (state.phase === 'selecting') {
    if (me?.secretId) {
      parts.push('প্রতিপক্ষের অপেক্ষায়...');
    } else {
      parts.push('আপনার নেতা নির্বাচন করুন');
    }
  } else if (state.phase === 'playing') {
    if (state.currentTurn === state.you) {
      parts.push('⚡ আপনার চাল');
    } else {
      parts.push("⌛ প্রতিপক্ষের চাল");
    }
  } else if (state.phase === 'finished') {
    if (state.winner === 'draw') parts.push('⚔️ ড্র হয়েছে');
    else if (state.winner === state.you) parts.push('🏆 আপনি জিতেছেন!');
    else parts.push('💀 আপনি হেরেছেন');
  }
  ui.status.textContent = parts.join(' • ');

  // Handle Turn Reminder Logic
  if (turnTimer) {
    clearTimeout(turnTimer);
    turnTimer = null;
  }
  ui.turnReminder.classList.add('hidden');

  if (state.phase === 'playing' && state.currentTurn === state.you) {
    turnTimer = setTimeout(() => {
      ui.turnReminder.classList.remove('hidden');
    }, 30000); // 30 seconds
  }

  // Show game end modal if game is finished
  if (state.phase === 'finished' && state.winner !== null) {
    showGameEndModal();
  }
  // Update Controls
  const isPlaying = state.phase === 'playing';
  const isMyTurn = state.currentTurn === state.you;

  ui.endTurnBtn.disabled = !(isPlaying && isMyTurn);
  ui.guessModeBtn.disabled = !(isPlaying && isMyTurn);

  // You can only answer Yes or No if it's NOT your turn (assuming opponent asked)
  ui.answerYesBtn.disabled = !(isPlaying && !isMyTurn);
  ui.answerNoBtn.disabled = !(isPlaying && !isMyTurn);

  if (state.code) {
    const link = `${location.origin}/?room=${state.code}`;
    ui.roomInfo.innerHTML = `
      <div class="room-share">
        <span>রুম: <strong>${state.code}</strong></span>
        <button class="btn-small" onclick="navigator.clipboard.writeText('${link}').then(() => alert('লিংক কপি হয়েছে!'))">
          লিংক কপি করুন 🔗
        </button>
      </div>
    `;
  } else {
    ui.roomInfo.innerHTML = '';
  }
}

let pc = null;
let localStream = null;
let remoteStream = null;

async function ensureLocalStream() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 20 }
    },
    audio: true
  });
  ui.localVideo.srcObject = localStream;
  return localStream;
}

function setupPeerConnection() {
  if (pc) return pc;
  pc = new RTCPeerConnection({
    iceServers: [
      // STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      // ExpressTURN (PRIMARY - 1000 GB/month free)
      {
        urls: 'turn:free.expressturn.com:3478',
        username: '000000002085951998',
        credential: 'LIdKKE0Jy54dlBc+bduw/YqZiJI='
      },
      // Backup TURN servers
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh'
      }
    ],
  });

  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE State:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      alert('কল সংযোগ বিচ্ছিন্ন হয়েছে। দয়া করে আবার চেষ্টা করুন।');
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('[WebRTC] ICE Candidate Type:', e.candidate.type, 'Protocol:', e.candidate.protocol);
      socket.emit('rtc-ice', { code: state.code, candidate: e.candidate });
    } else {
      console.log('[WebRTC] ICE gathering complete');
    }
  };
  pc.ontrack = (e) => {
    console.log('[WebRTC] Remote track received:', e.track.kind);
    if (!remoteStream) {
      remoteStream = new MediaStream();
      ui.remoteVideo.srcObject = remoteStream;
    }
    remoteStream.addTrack(e.track);

    // Ensure remote video is unmuted and plays
    ui.remoteVideo.muted = false;
    ui.remoteVideo.play().catch(err => {
      console.warn('[WebRTC] Autoplay prevented, waiting for user interaction:', err);
    });
  };
  return pc;
}

async function startCall() {
  try {
    console.log('[WebRTC] Starting call...');
    const stream = await ensureLocalStream();
    setupPeerConnection();
    stream.getTracks().forEach((t) => {
      console.log('[WebRTC] Adding local track:', t.kind);
      pc.addTrack(t, stream);
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('[WebRTC] Created offer, sending to peer');
    socket.emit('rtc-offer', { code: state.code, sdp: pc.localDescription });
    state.callActive = true;
  } catch (err) {
    console.error('[WebRTC] Call failed:', err);
  }
}


let candidateQueue = [];

async function handleOffer({ sdp }) {
  console.log('[WebRTC] Received offer from peer');
  await ensureLocalStream();
  setupPeerConnection();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  // Process queued candidates
  while (candidateQueue.length > 0) {
    const candidate = candidateQueue.shift();
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added queued ICE candidate');
    } catch (err) {
      console.error('[WebRTC] Error adding queued candidate:', err);
    }
  }

  localStream.getTracks().forEach((t) => {
    console.log('[WebRTC] Adding local track:', t.kind);
    pc.addTrack(t, localStream);
  });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log('[WebRTC] Created answer, sending to peer');
  socket.emit('rtc-answer', { code: state.code, sdp: pc.localDescription });
  state.callActive = true;
}

async function handleAnswer({ sdp }) {
  console.log('[WebRTC] Received answer from peer');
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  console.log('[WebRTC] Remote description set');

  // Process queued candidates (if any arrived before answer)
  while (candidateQueue.length > 0) {
    const candidate = candidateQueue.shift();
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added queued ICE candidate');
    } catch (err) {
      console.error('[WebRTC] Error adding queued candidate:', err);
    }
  }
}

async function handleIce({ candidate }) {
  try {
    console.log('[WebRTC] Received ICE candidate');
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      console.log('[WebRTC] Queueing candidate (remote description not set)');
      candidateQueue.push(candidate);
    }
  } catch (err) {
    console.error('[WebRTC] ICE candidate error:', err);
  }
}

function endCall() {
  socket.emit('endCall', { code: state.code });
  teardownCall();
}

function teardownCall() {
  if (pc) {
    pc.getSenders().forEach((s) => {
      try { s.track && s.track.stop(); } catch { }
    });
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach((t) => t.stop());
    remoteStream = null;
  }
  ui.localVideo.srcObject = null;
  ui.remoteVideo.srcObject = null;
  state.callActive = false;
}

function fixAudio() {
  console.log('[WebRTC] Manually fixing audio...');
  if (ui.remoteVideo && remoteStream) {
    ui.remoteVideo.muted = false;
    ui.remoteVideo.play()
      .then(() => alert('অডিও ঠিক করা হয়েছে!'))
      .catch(err => {
        console.error('[WebRTC] Manual play failed:', err);
        alert('অডিও ঠিক করা যায়নি। দয়া করে পেজ রিফ্রেশ করুন।');
      });
  } else {
    alert('কোন সচল কল নেই।');
  }
}

function renderSecret() {
  const me = state.players.find((p) => p.id === state.you);
  const secretId = me?.secretId;
  const tile = state.board.find((c) => c.id === secretId);
  ui.mySecret.innerHTML = tile
    ? `<div class="tile"><img src="${tile.image}"/><div>${tile.name}</div></div>`
    : '<div class="tip">নির্বাচন করা হয়নি</div>';
}

function showGameEndModal() {
  const me = state.players.find(p => p.id === state.you);
  const opponent = state.players.find(p => p.id !== state.you);

  if (!me || !opponent) return;

  // Determine result
  let resultText = '';
  let resultClass = '';

  if (state.winner === 'draw') {
    resultText = '⚔️ ড্র!';
    resultClass = 'draw';
    ui.modalTitle.textContent = 'খেলা শেষ';
  } else if (state.winner === state.you) {
    resultText = '🏆 আপনি জিতেছেন!';
    resultClass = 'win';
    ui.modalTitle.textContent = 'বিজয়!';
  } else {
    resultText = '💀 আপনি হেরেছেন';
    resultClass = 'lose';
    ui.modalTitle.textContent = 'খেলা শেষ';
  }

  ui.modalResult.textContent = resultText;
  ui.modalResult.className = `result-text ${resultClass}`;

  // Create player cards
  const html = `
    <div class="player-card ${state.winner === me.id ? 'winner' : 'loser'}">
      <h3>${me.name}</h3>
      <div class="status">${state.winner === me.id ? '🏆 WINNER' : state.winner === 'draw' ? '⚔️ DRAW' : '💀 DEFEATED'}</div>
    </div>
    <div class="player-card ${state.winner === opponent.id ? 'winner' : 'loser'}">
      <h3>${opponent.name}</h3>
      <div class="status">${state.winner === opponent.id ? '🏆 WINNER' : state.winner === 'draw' ? '⚔️ DRAW' : '💀 DEFEATED'}</div>
    </div>
  `;

  ui.modalPlayers.innerHTML = html;
  ui.gameEndModal.classList.remove('hidden');
}

function renderBoard() {
  ui.board.innerHTML = '';
  state.board.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'tile';
    if (state.crossed.has(c.id)) el.classList.add('crossed');
    el.innerHTML = `<img src="${c.image}" alt="${c.name}"/><div class="name">${c.name}</div>`;
    el.onclick = () => {
      if (state.phase === 'selecting') {
        socket.emit('selectSecret', { code: state.code, characterId: c.id });
      } else if (state.phase === 'playing') {
        if (state.guessMode && state.currentTurn === state.you) {
          socket.emit('guessCharacter', { code: state.code, characterId: c.id });
          state.guessMode = false;
          ui.guessModeBtn.textContent = 'নেতা গেস করুন';
          ui.guessModeBtn.classList.remove('highlight');
        } else {
          state.crossed.has(c.id)
            ? state.crossed.delete(c.id)
            : state.crossed.add(c.id);
          socket.emit('updateCrossed', { code: state.code, characterId: c.id });
          renderBoard();
        }
      }
    };
    ui.board.appendChild(el);
  });
}

function addMessage(msg) {
  const mine = msg.from === state.you;
  const div = document.createElement('div');
  div.className = 'msg' + (mine ? ' you' : '');
  div.textContent = msg.text;
  ui.messages.appendChild(div);
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

// Events
ui.createRoomBtn.onclick = () => {
  socket.emit('createRoom', { theme: state.selectedTheme }, (res) => {
    if (res?.code) {
      const name = ui.yourName.value || 'খেলোয়াড়';
      socket.emit('joinRoom', { code: res.code, name }, (joinRes) => {
        if (joinRes?.ok) {
          state.code = res.code;
          state.you = joinRes.you;
          state.board = joinRes.board;
          setLobbyVisible(false);
          updateStatus();
          renderBoard();
          const url = new URL(location.href);
          url.searchParams.set('room', res.code);
          history.replaceState({}, '', url);
        }
      });
    }
  });
};

ui.joinRoomBtn.onclick = () => {
  const code = ui.joinCode.value.trim().toUpperCase();
  if (!code) return;
  const name = ui.yourName.value || 'Guest';
  socket.emit('joinRoom', { code, name }, (joinRes) => {
    if (joinRes?.ok) {
      state.code = code;
      state.you = joinRes.you;
      state.board = joinRes.board;
      setLobbyVisible(false);
      updateStatus();
      renderBoard();
    } else {
      alert(joinRes?.error || 'জয়েন করা সম্ভব হয়নি');
    }
  });
};

ui.sendChatBtn.onclick = () => {
  const text = ui.chatInput.value.trim();
  if (!text) return;
  socket.emit('sendChat', { code: state.code, text });
  ui.chatInput.value = '';
};
ui.answerYesBtn.onclick = () => {
  socket.emit('answerYesNo', { code: state.code, answer: true });
};
ui.answerNoBtn.onclick = () => {
  socket.emit('answerYesNo', { code: state.code, answer: false });
};
ui.endTurnBtn.onclick = () => {
  socket.emit('endTurn', { code: state.code });
};
ui.guessModeBtn.onclick = () => {
  if (state.phase !== 'playing' || state.currentTurn !== state.you) return;
  state.guessMode = !state.guessMode;
  ui.guessModeBtn.textContent = state.guessMode ? 'যাকে সন্দেহ করেন তাকে ক্লিক করুন' : 'নেতা গেস করুন';
  ui.guessModeBtn.classList.toggle('highlight', state.guessMode);
};

ui.modeChatBtn.onclick = () => {
  ui.chat.classList.remove('hidden');
  ui.videoPanel.classList.add('hidden');
  ui.modeChatBtn.classList.add('active');
  ui.modeVideoBtn.classList.remove('active');
};
ui.modeVideoBtn.onclick = () => {
  ui.chat.classList.add('hidden');
  ui.videoPanel.classList.remove('hidden');
  ui.modeVideoBtn.classList.add('active');
  ui.modeChatBtn.classList.remove('active');
};

ui.startCallBtn.onclick = () => {
  if (state.callActive) return;
  ui.startCallBtn.textContent = 'কল যাচ্ছে...';
  socket.emit('requestCall', { code: state.code });
};

socket.on('incomingCall', ({ from }) => {
  // Simple custom confirmation (browser confirm is blocking, but easy for now. 
  // User asked for "option to start a call or not", a modal is better but confirm is standard first step)
  // Let's make a custom non-blocking UI element appear.
  const accept = confirm("ইনকামিং ভিডিও কল! রিসিভ করবেন?");
  if (accept) {
    socket.emit('callAccepted', { code: state.code });
    ui.modeVideoBtn.click(); // Auto-switch to video tab
    // Don't call startCall() here - the receiver should wait for the offer from the initiator
    // The offer will arrive via 'rtc-offer' event and trigger handleOffer()
  } else {
    socket.emit('callDeclined', { code: state.code });
  }
});

socket.on('callAccepted', () => {
  ui.startCallBtn.textContent = 'কল রিসিভ হয়েছে!';
  ui.modeVideoBtn.click(); // Auto-switch to video tab
  setTimeout(() => ui.startCallBtn.textContent = 'ভিডিও কল শুরু করুন', 2000);
  startCall();
});

socket.on('callDeclined', () => {
  alert("কল রিসিভ করা হয়নি।");
  ui.startCallBtn.textContent = 'ভিডিও কল শুরু করুন';
});

ui.endCallBtn.onclick = () => endCall();
ui.muteMicBtn.onclick = () => {
  if (!localStream) return;
  const tracks = localStream.getAudioTracks();
  tracks.forEach((t) => (t.enabled = !t.enabled));
  ui.muteMicBtn.textContent = tracks.some((t) => t.enabled) ? 'মিউট' : 'আনমিউট';
};
ui.muteCamBtn.onclick = () => {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  tracks.forEach((t) => (t.enabled = !t.enabled));
  ui.muteCamBtn.textContent = tracks.some((t) => t.enabled) ? 'ভিডিও বন্ধ' : 'ভিডিও চালু';
};

ui.fixAudioBtn.onclick = () => fixAudio();

ui.playAgainBtn.onclick = () => {
  location.reload();
};

// Socket listeners
socket.on('roomState', (room) => {
  state.code = room.code;
  // Preservation Fix: Do not overwrite the randomized board with the server's master board
  if (!state.board || state.board.length === 0) {
    state.board = room.board;
  }
  state.players = room.players;
  state.phase = room.phase;
  state.currentTurn = room.currentTurn;
  state.winner = room.winner;

  // Update video labels with actual player names
  const me = state.players.find(p => p.id === state.you);
  const opponent = state.players.find(p => p.id !== state.you);
  if (me) ui.localLabel.textContent = me.name;
  if (opponent) ui.remoteLabel.textContent = opponent.name;

  renderSecret();
  updateStatus();
  renderBoard();
});

socket.on('yourCrossed', (ids) => {
  state.crossed = new Set(ids);
  renderBoard();
});
socket.on('chatMessage', (msg) => addMessage(msg));
socket.on('yesNoAnswer', (payload) => {
  addMessage({ from: payload.from, text: `Answer: ${payload.answer}` });
});
socket.on('rtc-offer', (p) => handleOffer(p));
socket.on('rtc-answer', (p) => handleAnswer(p));
socket.on('rtc-ice', (p) => handleIce(p));
socket.on('endCall', () => teardownCall());

window.addEventListener('load', () => {
  const url = new URL(location.href);
  const code = url.searchParams.get('room');
  if (code) ui.joinCode.value = code;
});
