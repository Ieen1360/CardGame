let database;
const mySessionId = Math.random().toString(36).substring(7); // ID único desta aba

window.onload = () => { database = window.db || firebase.database(); };

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

const lobby = document.getElementById('lobby');
const waitingLobby = document.getElementById('waiting-lobby');
const gameScreen = document.getElementById('game-container');

// --- LÓGICA DE LOGIN ---

document.getElementById('createBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!roomName) return alert("Digite um nome!");

    database.ref('salas/' + roomName).once('value', snapshot => {
        if (snapshot.exists()) return alert("Sala já existe! Use 'Entrar'.");
        playerID = "p1";
        initRoom();
    });
};

document.getElementById('joinBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!roomName) return alert("Digite o nome!");

    database.ref('salas/' + roomName).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Sala não encontrada!");
        const data = snapshot.val();
        
        // Se p2 não existe ou sessionId do p2 é o meu
        if (!data.jogadores.p2 || data.jogadores.p2.sid === mySessionId) {
            playerID = "p2";
            enterRoom();
        } else {
            alert("A sala está realmente cheia!");
        }
    });
};

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) { for (let i = 1; i <= 13; i++) { deck.push(s + i.toString().padStart(2, '0')); } }
    deck = deck.sort(() => Math.random() - 0.5);
    
    const p1Hand = deck.splice(0, 7);
    const p2Hand = deck.splice(0, 7);
    const firstDisc = deck.pop();

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [firstDisc],
        jogadores: { 
            p1: { mao: p1Hand, sid: mySessionId }, 
            p2: { mao: p2Hand, sid: null, ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    lobby.style.display = 'none';
    waitingLobby.style.display = 'flex';

    const playerPath = `salas/${roomName}/jogadores/${playerID}`;
    
    // Marca como ativo e registra o ID da sessão
    database.ref(playerPath).update({ sid: mySessionId, ativo: true });
    
    // Se desconectar, limpa a vaga
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

// --- LÓGICA DE JOGO ---

function render() {
    if (!gameState) return;
    const isMyTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('turn-display').style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `[${gameState.estado.toUpperCase()}]`;

    // Mão do Jogador
    currentHand = gameState.jogadores[playerID].mao || [];
    document.getElementById('player-hand').innerHTML = "";
    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        img.onclick = () => handleDiscard(index);
        document.getElementById('player-hand').appendChild(img);
    });

    // Mão do Oponente
    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppHandCount = gameState.jogadores[oppID]?.mao?.length || 0;
    document.getElementById('opponent-hand').innerHTML = "";
    for (let i = 0; i < oppHandCount; i++) {
        const img = document.createElement('img');
        img.src = "Cards/Classic/back.png";
        img.className = "card-img opp";
        document.getElementById('opponent-hand').appendChild(img);
    }

    const lastD = gameState.descarte[gameState.descarte.length - 1];
    document.getElementById('discard-img').src = `Cards/Classic/${lastD}.png`;
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

document.getElementById('deck').onclick = () => buy('baralho');
document.getElementById('discard-pile').onclick = () => buy('descarte');

function buy(type) {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let newDeck = [...(gameState.baralho || [])];
    let newDiscard = [...(gameState.descarte || [])];
    tempCard = (type === 'baralho') ? newDeck.pop() : newDiscard.pop();
    document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
    database.ref(`salas/${roomName}`).update({ baralho: newDeck, descarte: newDiscard, estado: "decidir" });
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