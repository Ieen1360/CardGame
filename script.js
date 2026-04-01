let database;
let auth;
let currentUser = null;

// Configurações visuais iniciais
const randomBackNum = Math.floor(Math.random() * 6) + 1;
const cardBackPath = `Cards/Classic/Card-Back-0${randomBackNum}.png`;

// Variáveis de controle de jogo
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

window.onload = () => { 
    database = window.db || firebase.database(); 
    auth = firebase.auth();

    // Listener para o estado de login
    auth.onAuthStateChanged(user => {
        if (user) {
            handleAuth(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('main-menu').style.display = 'none';
        }
    });
};

// Bloqueio de saída acidental
window.onbeforeunload = function() {
    if(roomName) return "Se você sair, a partida será encerrada!";
};

// --- SISTEMA DE LOGIN ---
document.getElementById('googleLoginBtn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
};

document.getElementById('guestBtn').onclick = () => {
    auth.signInAnonymously();
};

function handleAuth(user) {
    currentUser = user;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    
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
        updateProfileUI(data);
    });

    listenForInvites(user.uid);
}

function updateProfileUI(data) {
    document.getElementById('user-name').innerText = data.name;
    document.getElementById('user-photo').src = data.photo;
    document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
    document.getElementById('my-uid-display').innerText = data.uid;
}

// --- SISTEMA DE DUELOS ---
function listenForInvites(myUid) {
    database.ref(`invites/${myUid}`).on('value', snap => {
        const invite = snap.val();
        if (invite) {
            if (confirm(`Desafio de ${invite.fromName}! Aceitar duelo?`)) {
                roomName = invite.room;
                playerID = "p2";
                database.ref(`invites/${myUid}`).remove();
                enterRoom();
            }
        }
    });
}

document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return alert("ID inválido!");
    
    const inviteData = {
        fromName: currentUser.displayName || "Convidado",
        fromUid: currentUser.uid,
        room: "duelo-" + Math.random().toString(36).substring(7)
    };
    
    database.ref(`invites/${friendUid}`).set(inviteData).then(() => {
        alert("Desafio enviado!");
        roomName = inviteData.room;
        playerID = "p1";
        initRoom();
    });
};

// --- LOGICA DE CRIAÇÃO E ENTRADA ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p1";
    initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p2";
    enterRoom();
};

// --- INICIALIZAÇÃO DA PARTIDA ---
function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) {
            deck.push(s + i.toString().padStart(2, '0'));
        }
    }
    deck = deck.sort(() => Math.random() - 0.5);
    const p1Hand = deck.splice(0, 9);
    const p2Hand = deck.splice(0, 9);
    const firstDisc = deck.pop();

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [firstDisc], vencedor: null,
        jogadores: { 
            p1: { uid: currentUser.uid, mao: p1Hand, ativo: true }, 
            p2: { uid: "", mao: p2Hand, ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('main-menu').style.display = 'none';
    const roomRef = database.ref(`salas/${roomName}`);
    roomRef.onDisconnect().remove();

    if(playerID === "p2") {
        roomRef.child('jogadores/p2').update({ uid: currentUser.uid, ativo: true });
    }

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) { location.reload(); return; }
        
        if (gameState.vencedor) {
            handleVictory(gameState.vencedor);
            return;
        }

        const p1Ok = gameState.jogadores.p1 && gameState.jogadores.p1.ativo;
        const p2Ok = gameState.jogadores.p2 && gameState.jogadores.p2.ativo;
        if (p1Ok && p2Ok) {
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

// --- VITÓRIA E PREMIAÇÃO ---
function handleVictory(vid) {
    if (playerID === vid) {
        // Ganha 50 moedas se for o vencedor
        database.ref(`users/${currentUser.uid}/coins`).transaction(current => (current || 0) + 50);
        showGameOverOverlay("VOCÊ VENCEU!");
    } else {
        // Se perder, não ganha nada mas também não perde o que já tem
        showGameOverOverlay("OPONENTE VENCEU!");
    }

    setTimeout(() => {
        database.ref(`salas/${roomName}`).remove().then(() => location.reload());
    }, 3000);
}

function showGameOverOverlay(msg) {
    let overlay = document.getElementById('game-over-overlay') || document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:9999; flex-direction:column;";
    const cor = msg.includes("VOCÊ") ? "#2ecc71" : "#e74c3c";
    overlay.innerHTML = `<h1 style="color:${cor}; font-size:60px;">${msg}</h1>`;
    document.body.appendChild(overlay);
}

// --- REGRAS DO JOGO ---
function isValidGroup(cards) {
    if (cards.length !== 3) return false;
    let p = cards.map(c => ({ s: c[0], v: parseInt(c.substring(1)) }));
    if (p.every(card => card.v === p[0].v)) return true;
    const sorted = p.sort((a, b) => a.v - b.v);
    const sameSuit = p.every(card => card.s === p[0].s);
    return sameSuit && (sorted[1].v === sorted[0].v + 1 && sorted[2].v === sorted[1].v + 1);
}

function canWin(hand) {
    if (hand.length < 9) return false;
    let h = [...hand];
    for (let i = 0; i < h.length; i++) {
        for (let j = i + 1; j < h.length; j++) {
            for (let k = j + 1; k < h.length; k++) {
                if (isValidGroup([h[i], h[j], h[k]])) {
                    let r1 = h.filter((_, idx) => idx !== i && idx !== j && idx !== k);
                    for (let m = 0; m < r1.length; m++) {
                        for (let n = m + 1; n < r1.length; n++) {
                            for (let o = n + 1; o < r1.length; o++) {
                                if (isValidGroup([r1[m], r1[n], r1[o]])) {
                                    let last = r1.filter((_, idx) => idx !== m && idx !== n && idx !== o);
                                    if (isValidGroup(last)) return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return false;
}

// --- RENDERIZAÇÃO ---
function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('turn-display').style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    currentHand = [...(gameState.jogadores[playerID].mao || [])].sort();
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

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
        img.onclick = () => handleDiscard(index);
        playerHandEl.appendChild(img);
    });

    const batidaBtn = document.getElementById('batida-btn');
    if (isMyTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!batidaBtn) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn'; btn.innerText = "BATER!";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else if (batidaBtn) batidaBtn.remove();

    document.getElementById('deck-img').src = cardBackPath;
    const discArr = gameState.descarte || [];
    document.getElementById('discard-img').src = discArr.length > 0 ? `Cards/Classic/${discArr[discArr.length - 1]}.png` : cardBackPath;

    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppCount = gameState.jogadores[oppID]?.mao?.length || 0;
    const oppEl = document.getElementById('opponent-hand');
    oppEl.innerHTML = "";
    for (let i = 0; i < oppCount; i++) {
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
            let last = d.pop();
            b = d.sort(() => Math.random() - 0.5);
            d = [last];
            alert("Baralho renovado!");
        }
        tempCard = b.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: b, descarte: d, estado: "decidir" });
    } else {
        if (d.length === 0) return;
        const card = d.pop();
        database.ref(`salas/${roomName}`).update({ 
            [`jogadores/${playerID}/mao`]: [...currentHand, card],
            descarte: d, estado: "descartar" 
        });
    }
}

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ 
        [`jogadores/${playerID}/mao`]: [...currentHand, tempCard],
        estado: "descartar" 
    });
};

document.getElementById('discard-instant-btn').onclick = () => {
    finishTurn([...(gameState.descarte || []), tempCard]);
};

function handleDiscard(index) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    let m = [...currentHand];
    const removed = m.splice(index, 1)[0];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: m });
    finishTurn([...(gameState.descarte || []), removed]);
}

function finishTurn(newDiscard) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscard, estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
}
