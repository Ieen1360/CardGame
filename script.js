let database, auth, currentUser;
const mySessionId = Math.random().toString(36).substring(7);
const randomBackNum = Math.floor(Math.random() * 6) + 1;
const cardBackPath = `Cards/Classic/Card-Back-0${randomBackNum}.png`;

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// --- INICIALIZAÇÃO E AUTH ---
window.addEventListener('load', () => {
    database = window.db;
    auth = window.auth;

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('lobby').style.display = 'block';
            document.getElementById('user-info').innerText = `Logado como: ${user.displayName || 'Convidado'}`;
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
        }
    });
});

document.getElementById('googleLoginBtn').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('guestBtn').onclick = () => auth.signInAnonymously();

// --- LOGICA DE SALAS ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite um nome!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    database.ref('salas/' + roomName).once('value', snapshot => {
        if (snapshot.exists()) return alert("Sala já existe!");
        playerID = "p1";
        initRoom();
    });
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    database.ref('salas/' + roomName).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Sala não encontrada!");
        playerID = "p2";
        enterRoom();
    });
};

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    deck = deck.sort(() => Math.random() - 0.5);
    
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
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ sid: mySessionId, ativo: true });

    database.ref(`salas/${roomName}`).on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;
        if (gameState.vencedor) return showGameOver(gameState.vencedor);

        const p1Ok = gameState.jogadores.p1?.ativo;
        const p2Ok = gameState.jogadores.p2?.ativo;
        if (p1Ok && p2Ok) {
            document.getElementById('waiting-lobby').style.display = 'none';
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

// --- JOGO (SUA ESTRUTURA ORIGINAL) ---
function render() {
    const isMyTurn = gameState.turno === playerID;
    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    turnDisplay.style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    currentHand = [...(gameState.jogadores[playerID].mao || [])].sort();
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    // Destaque de pares/trincas (sua lógica de ouro)
    let valCounts = {};
    currentHand.forEach(c => { let v = c.substring(1); valCounts[v] = (valCounts[v] || 0) + 1; });

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        if (valCounts[card.substring(1)] >= 2) {
            img.style.border = "3px solid gold";
            img.style.boxShadow = "0 0 15px gold";
        }
        img.onclick = () => {
            if (isMyTurn && gameState.estado === "descartar") handleDiscard(index);
        };
        playerHandEl.appendChild(img);
    });

    // Botão de Bater
    const batidaBtn = document.getElementById('batida-btn');
    if (isMyTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!batidaBtn) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn'; btn.innerText = "BATER!";
            btn.onclick = () => {
                database.ref(`users/${currentUser.uid}/coins`).transaction(c => (c || 0) + 50);
                database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            };
            document.body.appendChild(btn);
        }
    } else if (batidaBtn) batidaBtn.remove();

    // Centro e Oponente
    document.querySelector('#deck img').src = cardBackPath;
    const discArr = gameState.descarte || [];
    document.getElementById('discard-img').src = discArr.length > 0 ? `Cards/Classic/${discArr[discArr.length - 1]}.png` : cardBackPath;

    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppEl = document.getElementById('opponent-hand');
    oppEl.innerHTML = "";
    for (let i = 0; i < (gameState.jogadores[oppID]?.mao?.length || 0); i++) {
        let img = document.createElement('img');
        img.src = cardBackPath; img.className = "card-img opp";
        oppEl.appendChild(img);
    }
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

// --- AÇÕES ---
document.getElementById('deck').onclick = () => buy('baralho');
document.getElementById('discard-pile').onclick = () => buy('descarte');

function buy(type) {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let b = [...(gameState.baralho || [])];
    let d = [...(gameState.descarte || [])];
    
    if (type === 'baralho') {
        if (b.length === 0) {
            let last = d.pop(); b = d.sort(() => Math.random() - 0.5); d = [last];
        }
        tempCard = b.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: b, descarte: d, estado: "decidir" });
    } else {
        if (d.length === 0) return;
        const card = d.pop();
        database.ref(`salas/${roomName}`).update({ 
            [`jogadores/${playerID}/mao`]: [...currentHand, card], descarte: d, estado: "descartar" 
        });
    }
}

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ 
        [`jogadores/${playerID}/mao`]: [...currentHand, tempCard], estado: "descartar" 
    });
};

document.getElementById('discard-instant-btn').onclick = () => {
    finishTurn([...(gameState.descarte || []), tempCard]);
};

function handleDiscard(index) {
    let m = [...currentHand];
    const removed = m.splice(index, 1)[0];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: m });
    finishTurn([...(gameState.descarte || []), removed]);
}

function finishTurn(newDiscard) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscard, estado: "comprar", turno: playerID === "p1" ? "p2" : "p1"
    });
}

// --- UTILITÁRIOS ---
function isValidGroup(cards) {
    if (cards.length !== 3) return false;
    let p = cards.map(c => ({ s: c[0], v: parseInt(c.substring(1)) }));
    if (p.every(card => card.v === p[0].v)) return true;
    const sorted = p.sort((a, b) => a.v - b.v);
    return p.every(card => card.s === p[0].s) && (sorted[1].v === sorted[0].v + 1 && sorted[2].v === sorted[1].v + 1);
}

function canWin(hand) {
    if (hand.length < 9) return false;
    let h = [...hand];
    for (let i = 0; i < 9; i++) {
        for (let j = i + 1; j < 9; j++) {
            for (let k = j + 1; k < 9; k++) {
                if (isValidGroup([h[i], h[j], h[k]])) {
                    let r1 = h.filter((_, idx) => idx !== i && idx !== j && idx !== k);
                    if (isValidGroup([r1[0], r1[1], r1[2]]) && isValidGroup([r1[3], r1[4], r1[5]])) return true;
                }
            }
        }
    }
    return false;
}

function showGameOver(vencedorId) {
    let overlay = document.getElementById('game-over-overlay') || document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:9999; flex-direction:column; color:white;";
    document.body.appendChild(overlay);
    overlay.innerHTML = `<h1>${vencedorId === playerID ? "VOCÊ VENCEU!" : "OPONENTE VENCEU!"}</h1>`;
    setTimeout(() => { database.ref(`salas/${roomName}`).remove().then(() => location.reload()); }, 3000);
}
