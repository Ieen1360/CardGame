let database;
const mySessionId = Math.random().toString(36).substring(7);

window.onload = () => { 
    database = window.db || firebase.database(); 
};

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

const lobby = document.getElementById('lobby');
const waitingLobby = document.getElementById('waiting-lobby');
const gameScreen = document.getElementById('game-container');

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
        const j = data.jogadores || {};

        if (!j.p2 || j.p2.ativo === false) {
            playerID = "p2";
            enterRoom();
        } else {
            alert("Sala cheia!");
        }
    });
};

// --- INICIALIZAÇÃO (9 CARTAS) ---

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) {
            deck.push(s + i.toString().padStart(2, '0'));
        }
    }

    deck = deck.sort(() => Math.random() - 0.5);

    // DISTRIBUIÇÃO ALTERADA PARA 9 CARTAS
    const p1Hand = deck.splice(0, 9);
    const p2Hand = deck.splice(0, 9);
    const firstDisc = deck.pop();

    database.ref('salas/' + roomName).set({
        turno: "p1",
        estado: "comprar",
        baralho: deck,
        descarte: [firstDisc],
        jogadores: { 
            p1: { mao: p1Hand, ativo: true, sid: mySessionId }, 
            p2: { mao: p2Hand, ativo: false, sid: null } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    lobby.style.display = 'none';
    waitingLobby.style.display = 'flex';

    const playerPath = `salas/${roomName}/jogadores/${playerID}`;
    database.ref(playerPath).update({ sid: mySessionId, ativo: true });
    database.ref(playerPath).onDisconnect().update({ sid: null, ativo: false });

    database.ref(`salas/${roomName}`).on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;

        const p1Ok = gameState.jogadores.p1 && gameState.jogadores.p1.ativo;
        const p2Ok = gameState.jogadores.p2 && gameState.jogadores.p2.ativo;

        if (p1Ok && p2Ok) {
            waitingLobby.style.display = 'none';
            gameScreen.style.display = 'flex';
            render();
        } else {
            gameScreen.style.display = 'none';
            waitingLobby.style.display = 'flex';
            document.getElementById('count-number').innerText = (p1Ok && p2Ok) ? "2" : "1";
        }
    });
}

// --- JOGO ---

function render() {
    if (!gameState) return;
    const isMyTurn = gameState.turno === playerID;
    
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('turn-display').style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    // Renderiza 9 cartas (ou 10 durante o descarte)
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

document.getElementById('deck').onclick = () => performBuy('baralho');
document.getElementById('discard-pile').onclick = () => performBuy('descarte');

function performBuy(source) {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let newDeck = [...(gameState.baralho || [])];
    let newDiscard = [...(gameState.descarte || [])];
    
    if (source === 'baralho') {
        if (newDeck.length === 0) return alert("Acabou o baralho!");
        tempCard = newDeck.pop();
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ baralho: newDeck, estado: "decidir" });
    } else {
        if (newDiscard.length === 0) return;
        const cardFromDiscard = newDiscard.pop();
        database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentHand, cardFromDiscard] });
        database.ref(`salas/${roomName}`).update({ descarte: newDiscard, estado: "descartar" });
    }
}

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: [...currentHand, tempCard] });
    database.ref(`salas/${roomName}`).update({ estado: "descartar" });
};

document.getElementById('discard-instant-btn').onclick = () => {
    finalizeTurn([...(gameState.descarte || []), tempCard]);
};

function handleDiscard(index) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    let newHand = [...currentHand];
    const removed = newHand.splice(index, 1)[0];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: newHand });
    finalizeTurn([...(gameState.descarte || []), removed]);
}

function finalizeTurn(newDiscardPile) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscardPile,
        estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
}
