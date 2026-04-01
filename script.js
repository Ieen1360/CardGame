let database, auth, currentUser;
const mySessionId = Math.random().toString(36).substring(7);

// Configurações Globais
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;
const cardBackPath = `Cards/Classic/Card-Back-01.png`;

window.addEventListener('load', () => {
    database = window.db;
    auth = window.auth;

    // GERENCIADOR DE LOGIN
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('lobby').style.display = 'block';
            setupUser(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('lobby').style.display = 'none';
        }
    });

    // BOTÕES DE LOGIN
    document.getElementById('googleLoginBtn').onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => alert("Erro Google: " + e.message));
    };

    document.getElementById('guestBtn').onclick = () => {
        auth.signInAnonymously().catch(e => alert("Erro Convidado: " + e.message));
    };
});

function setupUser(user) {
    const userRef = database.ref('users/' + user.uid);
    userRef.on('value', snap => {
        let data = snap.val();
        if (!data) {
            data = { name: user.displayName || "Convidado", coins: 100, uid: user.uid };
            userRef.set(data);
        }
        document.getElementById('user-name').innerText = data.name;
        document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
        document.getElementById('my-uid-display').innerText = user.uid;
        if(user.photoURL) {
            document.getElementById('user-photo').src = user.photoURL;
            document.getElementById('user-photo').style.display = "inline";
        }
    });

    // Escutar convites de amigos
    database.ref(`invites/${user.uid}`).on('value', snap => {
        const inv = snap.val();
        if (inv) {
            if (confirm(`Desafio de ${inv.fromName}! Aceitar?`)) {
                roomName = inv.room;
                playerID = "p2";
                database.ref(`invites/${user.uid}`).remove();
                enterRoom();
            }
        }
    });
}

// --- LOGICA DE SALAS ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p1";
    initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p2";
    enterRoom();
};

document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid) return;
    const rName = "duelo-" + Math.random().toString(36).substring(7);
    database.ref(`invites/${friendUid}`).set({
        fromName: currentUser.displayName || "Convidado",
        room: rName
    });
    roomName = rName; playerID = "p1"; initRoom();
    alert("Convite enviado!");
};

// --- FUNÇÕES DE JOGO (MANTIDAS DO SEU CÓDIGO) ---
function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    deck.sort(() => Math.random() - 0.5);

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [deck.pop()], vencedor: null,
        jogadores: { 
            p1: { mao: deck.splice(0, 9), ativo: true, sid: mySessionId }, 
            p2: { mao: deck.splice(0, 9), ativo: false, sid: null } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('waiting-lobby').style.display = 'flex';
    
    const roomRef = database.ref(`salas/${roomName}`);
    roomRef.onDisconnect().remove();

    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ sid: mySessionId, ativo: true });

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;
        
        if (gameState.vencedor) {
            if (playerID === gameState.vencedor) {
                database.ref(`users/${currentUser.uid}/coins`).transaction(c => (c || 0) + 50);
                alert("VITÓRIA! +50 Moedas");
            }
            database.ref(`salas/${roomName}`).remove().then(() => location.reload());
            return;
        }

        if (gameState.jogadores.p1.ativo && gameState.jogadores.p2.ativo) {
            document.getElementById('waiting-lobby').style.display = 'none';
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('state-display').innerText = `[${gameState.estado}]`;

    currentHand = [...(gameState.jogadores[playerID].mao || [])].sort();
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        img.onclick = () => {
            if (isMyTurn && gameState.estado === "descartar") {
                let m = [...currentHand];
                const removed = m.splice(index, 1)[0];
                database.ref(`salas/${roomName}`).update({
                    [`jogadores/${playerID}/mao`]: m,
                    descarte: [...(gameState.descarte || []), removed],
                    estado: "comprar",
                    turno: playerID === "p1" ? "p2" : "p1"
                });
            }
        };
        playerHandEl.appendChild(img);
    });

    document.getElementById('discard-img').src = `Cards/Classic/${gameState.descarte.slice(-1)}.png`;
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

document.getElementById('deck').onclick = () => {
    if (gameState.turno === playerID && gameState.estado === "comprar") {
        let b = [...gameState.baralho]; tempCard = b.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: b, estado: "decidir" });
    }
};

document.getElementById('discard-pile').onclick = () => {
    if (gameState.turno === playerID && gameState.estado === "comprar") {
        let d = [...gameState.descarte];
        const card = d.pop();
        database.ref(`salas/${roomName}`).update({ 
            [`jogadores/${playerID}/mao`]: [...currentHand, card],
            descarte: d, estado: "descartar" 
        });
    }
};

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ 
        [`jogadores/${playerID}/mao`]: [...currentHand, tempCard],
        estado: "descartar" 
    });
};

document.getElementById('discard-instant-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({
        descarte: [...(gameState.descarte || []), tempCard],
        estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
};
