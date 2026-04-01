let database, auth, currentUser;
let roomName = "", playerID = "", gameState = null, currentHand = [], tempCard = null;
const cardBackPath = `Cards/Classic/Card-Back-01.png`;

// 1. ESPERA O CARREGAMENTO TOTAL
window.addEventListener('load', () => {
    database = window.db;
    auth = window.auth;

    if (!auth || !database) return console.error("Firebase não inicializado corretamente.");

    // Monitor de Autenticação
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('main-menu').style.display = 'block';
            setupProfile(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
        }
    });

    // Configuração dos botões de Login
    document.getElementById('googleLoginBtn').onclick = () => {
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    };
    document.getElementById('guestBtn').onclick = () => {
        auth.signInAnonymously();
    };
});

// 2. PERFIL E MOEDAS
function setupProfile(user) {
    const userRef = database.ref('users/' + user.uid);
    userRef.on('value', snap => {
        let data = snap.val();
        if (!data) {
            data = { name: user.displayName || "Convidado", coins: 100, uid: user.uid, photo: user.photoURL || "" };
            userRef.set(data);
        }
        document.getElementById('user-name').innerText = data.name;
        document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
        document.getElementById('my-uid-display').innerText = data.uid;
        if(data.photo) document.getElementById('user-photo').src = data.photo;
    });

    // Ouvir convites de duelo
    database.ref(`invites/${user.uid}`).on('value', snap => {
        const inv = snap.val();
        if (inv) {
            if (confirm(`Duelo de ${inv.fromName}!`)) {
                roomName = inv.room;
                playerID = "p2";
                database.ref(`invites/${user.uid}`).remove();
                enterRoom();
            }
        }
    });
}

// 3. LOGICA DE DUELOS E SALAS
document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return alert("ID Inválido");
    const rName = "duelo-" + Math.random().toString(36).substring(7);
    database.ref(`invites/${friendUid}`).set({ fromName: currentUser.displayName || "Convidado", room: rName });
    roomName = rName; playerID = "p1"; initRoom();
};

document.getElementById('createBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase();
    playerID = "p1"; initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase();
    playerID = "p2"; enterRoom();
};

// 4. JOGO (INICIALIZAÇÃO E RENDER)
function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    deck.sort(() => Math.random() - 0.5);

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [deck.pop()], vencedor: null,
        jogadores: { 
            p1: { uid: currentUser.uid, mao: deck.splice(0, 9), ativo: true }, 
            p2: { uid: "", mao: deck.splice(0, 9), ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    const roomRef = database.ref(`salas/${roomName}`);
    if (playerID === "p2") roomRef.child('jogadores/p2').update({ uid: currentUser.uid, ativo: true });

    roomRef.on('value', snap => {
        gameState = snap.val();
        if (!gameState) return;
        if (gameState.vencedor) {
            if (playerID === gameState.vencedor) {
                database.ref(`users/${currentUser.uid}/coins`).transaction(c => (c || 0) + 50);
                alert("GANHOU 50 MOEDAS!");
            }
            database.ref(`salas/${roomName}`).remove().then(() => location.reload());
            return;
        }
        if (gameState.jogadores.p1.ativo && gameState.jogadores.p2.ativo) {
            document.getElementById('main-menu').style.display = 'none';
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SUA VEZ" : "VEZ DELE";
    
    // Mão do Jogador
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = "";
    currentHand = gameState.jogadores[playerID].mao || [];
    currentHand.forEach((card, i) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.onclick = () => {
            if (isMyTurn && gameState.estado === "descartar") {
                let m = [...currentHand]; m.splice(i, 1);
                database.ref(`salas/${roomName}`).update({
                    [`jogadores/${playerID}/mao`]: m,
                    descarte: [...(gameState.descarte || []), card],
                    estado: "comprar", turno: playerID === "p1" ? "p2" : "p1"
                });
            }
        };
        handEl.appendChild(img);
    });

    document.getElementById('discard-img').src = `Cards/Classic/${gameState.descarte.slice(-1)}.png`;
    document.getElementById('deck-img').src = cardBackPath;
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "block" : "none";
}

// 5. COMPRA E DESCARTE
document.getElementById('deck').onclick = () => {
    if (gameState.turno === playerID && gameState.estado === "comprar") {
        let b = [...gameState.baralho]; tempCard = b.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: b, estado: "decidir" });
    }
};

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ [`jogadores/${playerID}/mao`]: [...currentHand, tempCard], estado: "descartar" });
};

document.getElementById('discard-instant-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ 
        descarte: [...(gameState.descarte || []), tempCard], 
        estado: "comprar", turno: playerID === "p1" ? "p2" : "p1" 
    });
};
