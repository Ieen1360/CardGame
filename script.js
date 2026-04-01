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
            alert("FIM DE JOGO! Vencedor: " + gameState.vencedor);
            location.reload();
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

// --- LÓGICA DE DETECÇÃO ---

// Retorna uma lista de valores que aparecem mais de uma vez na mão
function detectPairs(hand) {
    let counts = {};
    let pairs = [];
    hand.forEach(card => {
        let val = card.substring(1); // Pega o número (ex: 01, 12)
        counts[val] = (counts[val] || 0) + 1;
    });
    for (let val in counts) {
        if (counts[val] >= 2) pairs.push(val);
    }
    return pairs;
}

function isValidGroup(cards) {
    if (cards.length !== 3) return false;
    let parsed = cards.map(c => ({ suit: c[0], val: parseInt(c.substring(1)) }));
    const sameVal = parsed.every(c => c.val === parsed[0].val);
    const diffSuits = new Set(parsed.map(c => c.suit)).size === 3;
    if (sameVal && diffSuits) return true;
    const sameSuit = parsed.every(c => c.suit === parsed[0].suit);
    const sortedVals = parsed.map(c => c.val).sort((a, b) => a - b);
    return sameSuit && (sortedVals[1] === sortedVals[0] + 1 && sortedVals[2] === sortedVals[1] + 1);
}

function canWin(hand) {
    if (hand.length < 9) return false;
    let h = [...hand].sort();
    // Checagem básica por grupos de 3 ordenados
    return isValidGroup([h[0], h[1], h[2]]) && 
           isValidGroup([h[3], h[4], h[5]]) && 
           isValidGroup([h[6], h[7], h[8]]);
}

// --- RENDERIZAÇÃO ---

function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    currentHand = gameState.jogadores[playerID].mao || [];
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    // Detectar quais valores formam pares
    const valuesInPairs = detectPairs(currentHand);

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        
        // Se a carta faz parte de um par/trinca, adiciona um estilo especial
        if (valuesInPairs.includes(card.substring(1))) {
            img.style.border = "2px solid gold";
            img.style.boxShadow = "0 0 10px gold";
        }

        img.onclick = () => handleDiscard(index);
        playerHandEl.appendChild(img);
    });

    // Botão de Batida
    if (isMyTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!document.getElementById('batida-btn')) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn';
            btn.innerText = "BATER!";
            btn.style.cssText = "position:absolute; bottom:120px; background:gold; color:black; font-size:20px; padding:15px 30px; z-index:200; font-weight:bold; border-radius:10px; cursor:pointer;";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else {
        const b = document.getElementById('batida-btn');
        if (b) b.remove();
    }

    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppHandCount = gameState.jogadores[oppID]?.mao?.length || 0;
    const opponentHandEl = document.getElementById('opponent-hand');
    opponentHandEl.innerHTML = "";
    for (let i = 0; i < oppHandCount; i++) {
        const img = document.createElement('img');
        img.src = "Cards/Classic/back.png";
        img.className = "card-img opp";
        opponentHandEl.appendChild(img);
    }

    const lastD = (gameState.descarte || ["back"])[gameState.descarte.length - 1];
    document.getElementById('discard-img').src = `Cards/Classic/${lastD}.png`;
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
        tempCard = newDeck.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: newDeck, estado: "decidir" });
    } else {
        if (newDiscard.length === 0) return;
        const card = newDiscard.pop();
        database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentHand, card] });
        database.ref(`salas/${roomName}`).update({ descarte: newDiscard, estado: "descartar" });
    }
}

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentHand, tempCard] });
    database.ref(`salas/${roomName}`).update({ estado: "descartar" });
};

document.getElementById('discard-instant-btn').onclick = () => {
    finishTurn([...(gameState.descarte || []), tempCard]);
};

function handleDiscard(index) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    let newHand = [...currentHand];
    const removed = newHand.splice(index, 1)[0];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: newHand });
    finishTurn([...(gameState.descarte || []), removed]);
}

function finishTurn(newDiscardPile) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscardPile, estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
}
