let database;
let auth;
let currentUser = null;

// Configurações visuais
const cardBackPath = `Cards/Classic/Card-Back-01.png`;

// Variáveis de controle de jogo
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// Inicialização disparada pelo navegador
window.addEventListener('load', () => {
    database = window.db;
    auth = window.auth;

    if (!auth) {
        console.error("Erro: 'auth' não foi definido no firebase.js!");
        return;
    }

    // Gerencia o estado de Login
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('main-menu').style.display = 'block';
            setupUserAccount(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('main-menu').style.display = 'none';
        }
    });

    // Configura cliques de login
    document.getElementById('googleLoginBtn').onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => alert("Erro Google: " + e.message));
    };

    document.getElementById('guestBtn').onclick = () => {
        auth.signInAnonymously().catch(e => alert("Erro Convidado: " + e.message));
    };
});

function setupUserAccount(user) {
    const userRef = database.ref('users/' + user.uid);
    userRef.on('value', snap => {
        let data = snap.val();
        if (!data) {
            data = {
                name: user.displayName || "Convidado",
                photo: user.photoURL || "https://via.placeholder.com/50",
                coins: 100,
                uid: user.uid
            };
            userRef.set(data);
        }
        document.getElementById('user-name').innerText = data.name;
        document.getElementById('user-photo').src = data.photo;
        document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
        document.getElementById('my-uid-display').innerText = data.uid;
    });

    // Escuta convites de duelo
    database.ref(`invites/${user.uid}`).on('value', snap => {
        const invite = snap.val();
        if (invite) {
            if (confirm(`Desafio de ${invite.fromName}! Aceitar?`)) {
                roomName = invite.room;
                playerID = "p2";
                database.ref(`invites/${user.uid}`).remove();
                enterRoom();
            }
        }
    });
}

// --- LOGICA DE DUELO ---
document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return alert("ID inválido");
    
    const inviteData = {
        fromName: currentUser.displayName || "Convidado",
        room: "duelo-" + Math.random().toString(36).substring(7)
    };
    
    database.ref(`invites/${friendUid}`).set(inviteData).then(() => {
        alert("Desafio enviado!");
        roomName = inviteData.room;
        playerID = "p1";
        initRoom();
    });
};

// --- LOGICA DE SALA ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p1";
    initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p2";
    enterRoom();
};

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    }
    deck = deck.sort(() => Math.random() - 0.5);
    
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
    if (playerID === "p2") {
        roomRef.child('jogadores/p2').update({ uid: currentUser.uid, ativo: true });
    }

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;
        
        if (gameState.vencedor) {
            if (playerID === gameState.vencedor) {
                database.ref(`users/${currentUser.uid}/coins`).transaction(c => (c || 0) + 50);
                alert("VOCÊ VENCEU! +50 Moedas");
            } else {
                alert("OPONENTE VENCEU!");
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

// --- FUNÇÕES DE CARTAS (O CORAÇÃO DO JOGO) ---
function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('state-display').innerText = `[${gameState.estado}]`;

    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";
    currentHand = (gameState.jogadores[playerID].mao || []).sort();

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

    // Atualiza Baralho e Descarte
    const disc = gameState.descarte || [];
    document.getElementById('discard-img').src = disc.length > 0 ? `Cards/Classic/${disc[disc.length-1]}.png` : cardBackPath;
    document.getElementById('deck-img').src = cardBackPath;

    // Modal de compra
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

document.getElementById('deck').onclick = () => {
    if (gameState.turno === playerID && gameState.estado === "comprar") {
        let b = [...gameState.baralho];
        tempCard = b.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: b, estado: "decidir" });
    }
};

document.getElementById('discard-pile').onclick = () => {
    if (gameState.turno === playerID && gameState.estado === "comprar") {
        let d = [...gameState.descarte];
        if (d.length === 0) return;
        const card = d.pop();
        database.ref(`salas/${roomName}`).update({
            [`jogadores/${playerID}/mao`]: [...currentHand, card],
            descarte: d,
            estado: "descartar"
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
