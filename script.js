let database;
const mySessionId = Math.random().toString(36).substring(7);

window.onload = () => { database = window.db || firebase.database(); };

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// --- LOGIN ---
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
        const data = snapshot.val();
        if (!data.jogadores.p2 || data.jogadores.p2.ativo === false) {
            playerID = "p2";
            enterRoom();
        } else { alert("Sala cheia!"); }
    });
};

// --- INICIALIZAÇÃO ---
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
            p1: { mao: p1Hand, ativo: true, sid: mySessionId }, 
            p2: { mao: p2Hand, ativo: false, sid: null } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('waiting-lobby').style.display = 'flex';
    const playerPath = `salas/${roomName}/jogadores/${playerID}`;
    database.ref(playerPath).update({ sid: mySessionId, ativo: true });
    database.ref(playerPath).onDisconnect().update({ sid: null, ativo: false });

    database.ref(`salas/${roomName}`).on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;
        
        if (gameState.vencedor) {
            showGameOver(gameState.vencedor);
            return;
        }

        const p1Ok = gameState.jogadores.p1 && gameState.jogadores.p1.ativo;
        const p2Ok = gameState.jogadores.p2 && gameState.jogadores.p2.ativo;
        if (p1Ok && p2Ok) {
            document.getElementById('waiting-lobby').style.display = 'none';
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

function showGameOver(vencedorId) {
    let overlay = document.getElementById('game-over-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'game-over-overlay';
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:9999; flex-direction:column; font-family: sans-serif;";
        document.body.appendChild(overlay);
    }
    const msg = (vencedorId === playerID) ? "VOCÊ VENCEU!" : "OPONENTE VENCEU!";
    const cor = (vencedorId === playerID) ? "#2ecc71" : "#e74c3c";
    overlay.innerHTML = `<h1 style="color:${cor}; font-size:60px; font-weight:bold; text-shadow: 0 0 20px ${cor};">${msg}</h1>`;
    setTimeout(() => { location.reload(); }, 1500);
}

// --- LÓGICA DE VALIDAÇÃO ---

function isValidGroup(cards) {
    if (cards.length !== 3) return false;
    
    // Separar naipe (string) e valor (número)
    let p = cards.map(c => ({ s: c[0], v: parseInt(c.substring(1)) }));
    
    // 1. TRINCA (3 iguais): Todos os valores são iguais
    const isTrinca = p.every(card => card.v === p[0].v);
    if (isTrinca) return true;

    // 2. SEQUÊNCIA: Mesmo naipe e valores em ordem (ex: 1, 2, 3)
    const sorted = p.sort((a, b) => a.v - b.v);
    const sameSuit = p.every(card => card.s === p[0].s);
    const sequential = (sorted[1].v === sorted[0].v + 1 && sorted[2].v === sorted[1].v + 1);
    
    if (sameSuit && sequential) return true;

    return false;
}

function canWin(hand) {
    if (hand.length < 9) return false;
    let h = [...hand];

    // Testa todas as combinações de 3 cartas para formar 3 grupos
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

    // Sincroniza a mão local com o banco de dados
    let rawHand = gameState.jogadores[playerID].mao || [];
    currentHand = [...rawHand].sort();
    
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    // Lógica do Brilho (Qualquer carta que tenha um par de valor brilha)
    let valCounts = {};
    currentHand.forEach(c => { 
        let v = c.substring(1); 
        valCounts[v] = (valCounts[v] || 0) + 1; 
    });

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        
        // Brilha se houver 2 ou mais cartas do mesmo número
        if (valCounts[card.substring(1)] >= 2) {
            img.style.border = "3px solid gold";
            img.style.boxShadow = "0 0 15px gold";
        }
        
        img.onclick = () => handleDiscard(index);
        playerHandEl.appendChild(img);
    });

    // VERIFICAÇÃO DE BATIDA
    const podeBater = canWin(currentHand);
    const batidaBtnExistente = document.getElementById('batida-btn');

    if (isMyTurn && gameState.estado === "descartar" && podeBater) {
        if (!batidaBtnExistente) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn';
            btn.innerText = "BATER!";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else if (batidaBtnExistente) {
        batidaBtnExistente.remove();
    }

    // OPONENTE
    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppCount = gameState.jogadores[oppID]?.mao?.length || 0;
    const oppEl = document.getElementById('opponent-hand');
    oppEl.innerHTML = "";
    for (let i = 0; i < oppCount; i++) {
        let img = document.createElement('img');
        img.src = "Cards/Classic/Card-Back-01.png"; 
        img.className = "card-img opp";
        oppEl.appendChild(img);
    }

    // DESCARTE
    const discArr = gameState.descarte || [];
    const discImg = document.getElementById('discard-img');
    if (discArr.length > 0) {
        discImg.src = `Cards/Classic/${discArr[discArr.length - 1]}.png`;
    } else {
        discImg.src = "Cards/Classic/Card-Back-01.png";
    }

    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

// --- AÇÕES ---

document.getElementById('deck').onclick = () => buy('baralho');
document.getElementById('discard-pile').onclick = () => buy('descarte');

function buy(type) {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let newDeck = [...(gameState.baralho || [])];
    let newDiscard = [...(gameState.descarte || [])];
    
    if (type === 'baralho') {
        if (newDeck.length === 0) return alert("Baralho vazio!");
        tempCard = newDeck.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: newDeck, estado: "decidir" });
    } else {
        if (newDiscard.length === 0) return;
        const card = newDiscard.pop();
        let currentMao = gameState.jogadores[playerID].mao || [];
        database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentMao, card] });
        database.ref(`salas/${roomName}`).update({ descarte: newDiscard, estado: "descartar" });
    }
}

document.getElementById('keep-btn').onclick = () => {
    let currentMao = gameState.jogadores[playerID].mao || [];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentMao, tempCard] });
    database.ref(`salas/${roomName}`).update({ estado: "descartar" });
};

document.getElementById('discard-instant-btn').onclick = () => {
    finishTurn([...(gameState.descarte || []), tempCard]);
};

function handleDiscard(index) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    // IMPORTANTE: Pegamos a mão exatamente como ela está renderizada (ordenada)
    let myMaoRendered = [...(gameState.jogadores[playerID].mao || [])].sort();
    const removed = myMaoRendered.splice(index, 1)[0];
    
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: myMaoRendered });
    finishTurn([...(gameState.descarte || []), removed]);
}

function finishTurn(newDiscardPile) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscardPile, estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
}
