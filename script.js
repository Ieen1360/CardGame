let database;
const mySessionId = Math.random().toString(36).substring(7);

window.onload = () => { database = window.db || firebase.database(); };

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// --- SISTEMA DE LOGIN ---

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

// --- INICIALIZAÇÃO DO JOGO ---

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
            alert("🏆 FIM DE JOGO! O vencedor é: " + gameState.vencedor.toUpperCase());
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

// --- LÓGICA DE DETECÇÃO E VITÓRIA (Pife 9 Cartas) ---

function detectPairs(hand) {
    let counts = {};
    let pairs = [];
    hand.forEach(card => {
        let val = card.substring(1);
        counts[val] = (counts[val] || 0) + 1;
    });
    for (let v in counts) { if (counts[v] >= 2) pairs.push(v); }
    return pairs;
}

function isValidGroup(cards) {
    if (cards.length !== 3) return false;
    let p = cards.map(c => ({ s: c[0], v: parseInt(c.substring(1)) }));

    // TRINCA: Mesmo valor, naipes diferentes
    const isTrinca = p.every(c => c.v === p[0].v) && new Set(p.map(c => c.s)).size === 3;
    if (isTrinca) return true;

    // SEQUÊNCIA: Mesmo naipe, valores seguidos
    const isSeq = p.every(c => c.s === p[0].s) && 
                  p.map(c => c.v).sort((a,b)=>a-b).every((v,i,a) => i===0 || v === a[i-1]+1);
    return isSeq;
}

function canWin(hand) {
    if (hand.length < 9) return false;
    let h = [...hand];

    // Busca exaustiva: Tenta achar 3 grupos de 3 em qualquer ordem
    for (let i = 0; i < h.length; i++) {
        for (let j = i + 1; j < h.length; j++) {
            for (let k = j + 1; k < h.length; k++) {
                if (isValidGroup([h[i], h[j], h[k]])) {
                    let r1 = h.filter((_, idx) => idx !== i && idx !== j && idx !== k);
                    for (let m = 0; m < r1.length; m++) {
                        for (let n = m + 1; n < r1.length; n++) {
                            for (let o = n + 1; o < r1.length; o++) {
                                if (isValidGroup([r1[m], r1[n], r1[o]])) {
                                    let lastGroup = r1.filter((_, idx) => idx !== m && idx !== n && idx !== o);
                                    if (isValidGroup(lastGroup)) return true;
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

    // Organiza a mão visualmente (Naipe e Valor)
    currentHand = (gameState.jogadores[playerID].mao || []).sort();
    const playerHandEl = document.getElementById('player-hand');
    playerHandEl.innerHTML = "";

    const pairList = detectPairs(currentHand);

    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        if (pairList.includes(card.substring(1))) {
            img.style.border = "3px solid #f1c40f";
            img.style.boxShadow = "0 0 15px #f1c40f";
        }
        img.onclick = () => handleDiscard(index);
        playerHandEl.appendChild(img);
    });

    // BOTÃO DE BATIDA
    if (isMyTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!document.getElementById('batida-btn')) {
            let btn = document.createElement('button');
            btn.id = 'batida-btn';
            btn.innerText = "BATER!";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else {
        const b = document.getElementById('batida-btn'); if (b) b.remove();
    }

    // CARTAS DO OPONENTE
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

    // PILHA DE DESCARTE
    const discardArr = gameState.descarte || [];
    const discardImgEl = document.getElementById('discard-img');
    if (discardArr.length > 0) {
        const lastCard = discardArr[discardArr.length - 1];
        discardImgEl.src = `Cards/Classic/${lastCard}.png`;
    } else {
        discardImgEl.src = "Cards/Classic/Card-Back-01.png";
    }

    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

// --- AÇÕES DO JOGO ---

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
