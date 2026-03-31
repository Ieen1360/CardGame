let database;
const mySessionId = Math.random().toString(36).substring(7);

window.onload = () => { 
    // Tenta pegar o db global definido no seu firebase.js
    database = window.db || firebase.database(); 
    console.log("Sistema pronto. ID da Sessão:", mySessionId);
};

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

const lobby = document.getElementById('lobby');
const waitingLobby = document.getElementById('waiting-lobby');
const gameScreen = document.getElementById('game-container');

// --- LÓGICA DE LOGIN E ENTRADA ---

document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite um nome para a sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');

    database.ref('salas/' + roomName).once('value', snapshot => {
        if (snapshot.exists()) {
            alert("Esta sala já existe! Tente outro nome ou clique em Entrar.");
        } else {
            playerID = "p1";
            initRoom();
        }
    });
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');

    database.ref('salas/' + roomName).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Sala não encontrada!");
        
        const data = snapshot.val();
        const j = data.jogadores || {};

        // Lógica de Vaga: Entra como P2 se o P2 não estiver ativo
        if (!j.p2 || j.p2.ativo === false) {
            playerID = "p2";
            enterRoom();
        } else {
            alert("A sala está ocupada por dois jogadores ativos.");
        }
    });
};

// --- GERAÇÃO DO BARALHO E INICIALIZAÇÃO ---

function initRoom() {
    // 1. Gerar as 52 cartas
    const suits = ['h', 'd', 'c', 's']; // hearts, diamonds, clubs, spades
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) {
            // Formato: h01, s12, etc (precisa bater com os nomes dos seus arquivos .png)
            deck.push(s + i.toString().padStart(2, '0'));
        }
    }

    // 2. Embaralhar
    deck = deck.sort(() => Math.random() - 0.5);

    // 3. Distribuir 7 cartas para cada
    const p1Hand = deck.splice(0, 7);
    const p2Hand = deck.splice(0, 7);
    
    // 4. Primeira carta do descarte
    const firstDisc = deck.pop();

    // 5. Salvar no Firebase
    database.ref('salas/' + roomName).set({
        turno: "p1",
        estado: "comprar",
        baralho: deck,
        descarte: [firstDisc],
        jogadores: { 
            p1: { mao: p1Hand, ativo: true, sid: mySessionId }, 
            p2: { mao: p2Hand, ativo: false, sid: null } 
        }
    }).then(() => {
        console.log("Sala criada com sucesso!");
        enterRoom();
    });
}

function enterRoom() {
    lobby.style.display = 'none';
    waitingLobby.style.display = 'flex';

    const playerPath = `salas/${roomName}/jogadores/${playerID}`;
    
    // Atualiza meu estado para Ativo
    database.ref(playerPath).update({ 
        sid: mySessionId, 
        ativo: true 
    });
    
    // Se eu fechar a aba, minha vaga fica livre para outro
    database.ref(playerPath).onDisconnect().update({ 
        sid: null, 
        ativo: false 
    });

    // Ouvinte em tempo real para o estado do jogo
    database.ref(`salas/${roomName}`).on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;

        const p1Ok = gameState.jogadores.p1 && gameState.jogadores.p1.ativo;
        const p2Ok = gameState.jogadores.p2 && gameState.jogadores.p2.ativo;

        // Só libera o jogo se os dois estiverem ativos
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

// --- RENDERIZAÇÃO E INTERFACE ---

function render() {
    if (!gameState) return;
    const isMyTurn = gameState.turno === playerID;
    
    // Status Bar
    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    turnDisplay.style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `— [${gameState.estado.toUpperCase()}]`;

    // Minha Mão
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

    // Mão do Oponente (Cartas viradas)
    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppHandCount = (gameState.jogadores[oppID] && gameState.jogadores[oppID].mao) ? gameState.jogadores[oppID].mao.length : 0;
    const opponentHandEl = document.getElementById('opponent-hand');
    opponentHandEl.innerHTML = "";
    for (let i = 0; i < oppHandCount; i++) {
        const img = document.createElement('img');
        img.src = "Cards/Classic/back.png";
        img.className = "card-img opp";
        opponentHandEl.appendChild(img);
    }

    // Pilha de Descarte (Última carta)
    const discArray = gameState.descarte || [];
    const lastD = discArray[discArray.length - 1];
    document.getElementById('discard-img').src = `Cards/Classic/${lastD}.png`;

    // Modal de Decisão (Aparece quando você compra do Baralho)
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";
}

// --- AÇÕES DE JOGO ---

document.getElementById('deck').onclick = () => performBuy('baralho');
document.getElementById('discard-pile').onclick = () => performBuy('descarte');

function performBuy(source) {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;

    let newDeck = [...(gameState.baralho || [])];
    let newDiscard = [...(gameState.descarte || [])];
    
    if (source === 'baralho') {
        if (newDeck.length === 0) return alert("O baralho acabou!");
        tempCard = newDeck.pop();
        
        // Se comprou do baralho, abre o modal para decidir se fica ou joga fora
        document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
        database.ref(`salas/${roomName}`).update({ 
            baralho: newDeck, 
            estado: "decidir" 
        });
    } else {
        // Se comprou do descarte, a carta vai direto para a mão
        if (newDiscard.length === 0) return;
        const cardFromDiscard = newDiscard.pop();
        const updatedHand = [...currentHand, cardFromDiscard];
        
        database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: updatedHand });
        database.ref(`salas/${roomName}`).update({ 
            descarte: newDiscard, 
            estado: "descartar" 
        });
    }
}

// Botões do Modal
document.getElementById('keep-btn').onclick = () => {
    const updatedHand = [...currentHand, tempCard];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: updatedHand });
    database.ref(`salas/${roomName}`).update({ estado: "descartar" });
};

document.getElementById('discard-instant-btn').onclick = () => {
    const updatedDiscard = [...(gameState.descarte || []), tempCard];
    finalizeTurn(updatedDiscard);
};

// Clicar em uma carta da mão para descartar
function handleDiscard(index) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    
    let newHand = [...currentHand];
    const removedCard = newHand.splice(index, 1)[0];
    
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: newHand });
    
    const updatedDiscard = [...(gameState.descarte || []), removedCard];
    finalizeTurn(updatedDiscard);
}

function finalizeTurn(newDiscardPile) {
    const nextTurn = (playerID === "p1") ? "p2" : "p1";
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscardPile,
        estado: "comprar",
        turno: nextTurn
    });
}