// Pegar dados da URL (Ex: jogo.html?sala=teste&role=p1)
const urlParams = new URLSearchParams(window.location.search);
const roomName = urlParams.get('sala');
const playerID = urlParams.get('role'); // "p1" ou "p2"

const mySessionId = Math.random().toString(36).substring(7);
const cardBackPath = `Cards/Classic/Card-Back-01.png`;

let gameState = null;
let currentHand = [];
let tempCard = null;

window.onload = () => {
    if (!roomName || !playerID) {
        alert("Erro ao entrar na sala!");
        window.location.href = "menu.html";
        return;
    }
    
    document.getElementById('room-name-display').innerText = `Sala: ${roomName.toUpperCase()}`;
    initGameSync();
};

function initGameSync() {
    const roomRef = database.ref(`salas/${roomName}`);

    // Se for P1 e a sala não existir, ele cria o baralho
    if (playerID === "p1") {
        roomRef.once('value', snap => {
            if (!snap.exists()) {
                const suits = ['h', 'd', 'c', 's'];
                let deck = [];
                for (let s of suits) for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
                deck = deck.sort(() => Math.random() - 0.5);

                roomRef.set({
                    turno: "p1",
                    estado: "comprar",
                    baralho: deck,
                    descarte: [deck.pop()],
                    vencedor: null,
                    jogadores: {
                        p1: { mao: deck.splice(0, 9), ativo: true, sid: mySessionId },
                        p2: { mao: deck.splice(0, 9), ativo: false, sid: null }
                    }
                });
            }
        });
    } else {
        // Se for P2, ele apenas avisa que entrou
        roomRef.child(`jogadores/p2`).update({ ativo: true, sid: mySessionId });
    }

    // Escuta mudanças no jogo em tempo real
    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;

        // Se ambos estiverem ativos, remove o overlay de espera
        if (gameState.jogadores.p1?.ativo && gameState.jogadores.p2?.ativo) {
            document.getElementById('waiting-overlay').style.display = 'none';
            render();
        }
    });
}

function render() {
    const isMyTurn = gameState.turno === playerID;
    const turnEl = document.getElementById('turn-display');
    turnEl.innerText = isMyTurn ? "SEU TURNO" : "TURNO DO OPONENTE";
    turnEl.style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = `| Status: ${gameState.estado.toUpperCase()}`;

    // Renderizar sua mão
    currentHand = (gameState.jogadores[playerID].mao || []).sort();
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = "";
    
    currentHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        img.onclick = () => {
            if (isMyTurn && gameState.estado === "descartar") discardCard(index);
        };
        handEl.appendChild(img);
    });

    // Atualizar Descarte
    const d = gameState.descarte || [];
    document.getElementById('discard-img').src = d.length > 0 ? `Cards/Classic/${d[d.length-1]}.png` : cardBackPath;

    // Modal de decisão
    document.getElementById('decision-modal').style.display = (isMyTurn && gameState.estado === "decidir") ? "flex" : "none";

    // Mão do oponente (costas das cartas)
    const oppID = playerID === "p1" ? "p2" : "p1";
    const oppHandEl = document.getElementById('opponent-hand');
    oppHandEl.innerHTML = "";
    for (let i = 0; i < (gameState.jogadores[oppID]?.mao?.length || 0); i++) {
        const img = document.createElement('img');
        img.src = cardBackPath;
        img.className = "card-img opp";
        oppHandEl.appendChild(img);
    }
}

// Ações de Compra
document.getElementById('deck').onclick = () => {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let b = [...gameState.baralho];
    tempCard = b.pop();
    document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
    database.ref(`salas/${roomName}`).update({ baralho: b, estado: "decidir" });
};

document.getElementById('discard-pile').onclick = () => {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let d = [...gameState.descarte];
    if (d.length === 0) return;
    const card = d.pop();
    database.ref(`salas/${roomName}`).update({
        [`jogadores/${playerID}/mao`]: [...currentHand, card],
        descarte: d,
        estado: "descartar"
    });
};

// Botões do Modal
document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({
        [`jogadores/${playerID}/mao`]: [...currentHand, tempCard],
        estado: "descartar"
    });
};

document.getElementById('discard-instant-btn').onclick = () => {
    const newDiscard = [...gameState.descarte, tempCard];
    finishTurn(newDiscard);
};

function discardCard(index) {
    let m = [...currentHand];
    const removed = m.splice(index, 1)[0];
    const newDiscard = [...gameState.descarte, removed];
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ mao: m });
    finishTurn(newDiscard);
}

function finishTurn(newDiscard) {
    database.ref(`salas/${roomName}`).update({
        descarte: newDiscard,
        estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1"
    });
}
