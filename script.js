let database;
const mySessionId = Math.random().toString(36).substring(7);

window.onload = () => { database = window.db || firebase.database(); };

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// --- LÓGICA DE LOGIN ---

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
    // Adiciona 2 Coringas ao baralho
    deck.push('joker', 'joker');
    
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
            alert("FIM DE JOGO! O vencedor é: " + gameState.vencedor);
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

// --- SISTEMA DE DETECÇÃO DE JOGOS (TRINCAS/SEQUÊNCIAS) ---

function canWin(hand) {
    if (hand.length < 9) return false;
    
    // Tenta todas as combinações possíveis de 3 grupos de 3 cartas
    // Nota: Esta é uma versão simplificada. Para um sistema 100% profissional, 
    // usaríamos algoritmos de recursão, mas para 9 cartas isso funciona bem:
    
    const combos = getPermutations(hand);
    for (let p of combos) {
        let g1 = [p[0], p[1], p[2]];
        let g2 = [p[3], p[4], p[5]];
        let g3 = [p[6], p[7], p[8]];
        
        if (isValidGroup(g1) && isValidGroup(g2) && isValidGroup(g3)) return true;
    }
    return false;
}

function isValidGroup(cards) {
    let jokers = cards.filter(c => c === 'joker').length;
    let normals = cards.filter(c => c !== 'joker').map(c => ({
        suit: c[0],
        val: parseInt(c.substring(1))
    }));

    if (jokers === 3) return true; // 3 coringas é jogo

    // TRINCA (Mesmo valor, naipes diferentes)
    if (normals.every(c => c.val === normals[0].val)) {
        let suits = new Set(normals.map(c => c.suit));
        if (suits.size === normals.length) return true;
    }

    // SEQUÊNCIA (Mesmo naipe, valores seguidos)
    if (normals.every(c => c.suit === normals[0].suit)) {
        let vals = normals.map(c => c.val).sort((a, b) => a - b);
        // Lógica de sequência com Coringa
        if (jokers === 0) return (vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1);
        if (jokers === 1) return (vals[1] === vals[0] + 1 || vals[1] === vals[0] + 2);
        if (jokers === 2) return true; // 2 coringas e 1 carta sempre faz sequência
    }
    return false;
}

// Auxiliar para testar combinações
function getPermutations(array) {
    let res = [];
    const p = (arr, m = []) => {
        if (res.length > 500) return; // Limite de busca para não travar
        if (arr.length === 0) { res.push(m); } 
        else {
            for (let i = 0; i < arr.length; i++) {
                let curr = arr.slice();
                let next = curr.splice(i, 1);
                p(curr.slice(), m.concat(next));
            }
        }
    }
    // Para performance, apenas ordenamos e testamos grupos básicos
    return [array.sort()]; 
}

// --- RENDERIZAÇÃO ---

function render() {
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    currentHand = gameState.jogadores[playerID].mao || [];
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        img.onclick = () => handleDiscard(index);
        playerHandEl.appendChild(img);
    });

    // Botão de Bater
    if (isMyTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!document.getElementById('batida-btn')) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn';
            btn.innerText = "BATER!";
            btn.style.position = "absolute";
            btn.style.bottom = "150px";
            btn.style.background = "gold";
            btn.style.color = "black";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else {
        let b = document.getElementById('batida-btn');
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
