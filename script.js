let database;
// RECUPERAÇÃO DE SESSÃO (Anti-F5)
const mySessionId = localStorage.getItem('pife_sid') || Math.random().toString(36).substring(7);
localStorage.setItem('pife_sid', mySessionId);

const randomBackNum = Math.floor(Math.random() * 6) + 1;
const cardBackPath = `Cards/Classic/Card-Back-0${randomBackNum}.png`;

window.onload = () => { 
    database = window.db || firebase.database(); 
    checkActiveSession(); 
};

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

function checkActiveSession() {
    const savedRoom = localStorage.getItem('pife_room');
    if (savedRoom) {
        roomName = savedRoom;
        playerID = localStorage.getItem('pife_pid');
        enterRoom();
    }
}

// --- LOGIN ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return;
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    database.ref('salas/' + roomName).once('value', snapshot => {
        if (snapshot.exists()) return alert("Sala já existe!");
        playerID = "p1";
        initRoom();
    });
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return;
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    database.ref('salas/' + roomName).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Sala não encontrada!");
        playerID = "p2";
        enterRoom();
    });
};

// --- CONTROLE DE PARTIDA ---
function generateDeck() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    }
    return deck.sort(() => Math.random() - 0.5);
}

function initRoom() {
    let deck = generateDeck();
    const p1Hand = deck.splice(0, 9);
    const p2Hand = deck.splice(0, 9);
    const firstDisc = deck.pop();

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [firstDisc], 
        vencedor: null, historico: [],
        pontos: { p1: 0, p2: 0 },
        jogadores: { 
            p1: { mao: p1Hand, ativo: true, sid: mySessionId }, 
            p2: { mao: p2Hand, ativo: false, sid: null } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    localStorage.setItem('pife_room', roomName);
    localStorage.setItem('pife_pid', playerID);
    document.getElementById('lobby').style.display = 'none';

    const roomRef = database.ref(`salas/${roomName}`);
    
    // Se o jogador sair, marca como inativo mas NÃO deleta a sala imediatamente
    // A sala só é limpa quando a partida (Melhor de 3) acaba
    database.ref(`salas/${roomName}/jogadores/${playerID}`).update({ sid: mySessionId, ativo: true });

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) { localStorage.clear(); location.reload(); return; }
        
        if (gameState.vencedor) {
            handleVictory(gameState.vencedor);
            return;
        }

        const p1Ok = gameState.jogadores.p1?.ativo;
        const p2Ok = gameState.jogadores.p2?.ativo;
        
        if (p1Ok && p2Ok) {
            document.getElementById('waiting-lobby').style.display = 'none';
            document.getElementById('game-container').style.display = 'flex';
            render();
        } else {
            document.getElementById('waiting-lobby').style.display = 'flex';
            document.getElementById('game-container').style.display = 'none';
        }
    });
}

function handleVictory(vid) {
    const isMe = (vid === playerID);
    const overlay = document.createElement('div');
    overlay.className = "victory-overlay";
    overlay.innerHTML = `<h1 style="color:gold">${isMe ? "GANHASTE A RODADA!" : "OPONENTE GANHOU!"}</h1>`;
    document.body.appendChild(overlay);

    if (playerID === "p1") { // Apenas um jogador processa o placar
        setTimeout(() => {
            let p = gameState.pontos;
            p[vid]++;
            if (p[vid] >= 3) {
                alert("FIM DE JOGO! " + vid.toUpperCase() + " É O CAMPEÃO!");
                database.ref(`salas/${roomName}`).remove();
            } else {
                let deck = generateDeck();
                database.ref(`salas/${roomName}`).update({
                    vencedor: null, estado: "comprar",
                    baralho: deck, descarte: [deck.pop()],
                    historico: [], pontos: p,
                    "jogadores/p1/mao": deck.splice(0, 9),
                    "jogadores/p2/mao": deck.splice(0, 9)
                });
                overlay.remove();
            }
        }, 3000);
    }
}

// --- REGRAS ---
function canWin(hand) {
    if (hand.length < 9) return false;
    const check = (cards) => {
        if (cards.length !== 3) return false;
        let p = cards.map(c => ({ s: c[0], v: parseInt(c.substring(1)) }));
        if (p.every(c => c.v === p[0].v)) return true;
        const s = p.sort((a,b) => a.v - b.v);
        return p.every(c => c.s === p[0].s) && (s[1].v === s[0].v+1 && s[2].v === s[1].v+1);
    };
    let h = [...hand];
    for (let i=0; i<h.length; i++) {
        for (let j=i+1; j<h.length; j++) {
            for (let k=j+1; k<h.length; k++) {
                if (check([h[i], h[j], h[k]])) {
                    let r1 = h.filter((_, x) => x!==i && x!==j && x!==k);
                    for (let m=0; m<r1.length; m++) {
                        for (let n=m+1; n<r1.length; n++) {
                            for (let o=n+1; o<r1.length; o++) {
                                if (check([r1[m], r1[n], r1[o]])) {
                                    let last = r1.filter((_, x) => x!==m && x!==n && x!==o);
                                    if (check(last)) return true;
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
    const isTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isTurn ? "TEU TURNO" : "TURNO DO OPONENTE";
    document.getElementById('turn-display').style.color = isTurn ? "#2ecc71" : "#e74c3c";
    document.getElementById('state-display').innerText = gameState.estado.toUpperCase();
    
    document.getElementById('my-score').innerText = gameState.pontos[playerID];
    const opp = playerID === "p1" ? "p2" : "p1";
    document.getElementById('opp-score').innerText = gameState.pontos[opp];

    // Histórico (Mostra as últimas 12 cartas que saíram)
    const histList = document.getElementById('history-list');
    histList.innerHTML = (gameState.historico || []).slice(-12).map(c => `<span>${c}</span>`).join(" ");

    // Mão do Jogador
    currentHand = (gameState.jogadores[playerID].mao || []).sort();
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = "";
    
    let counts = {};
    currentHand.forEach(c => counts[c.substring(1)] = (counts[c.substring(1)] || 0) + 1);

    currentHand.forEach((card, idx) => {
        let img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img";
        if (counts[card.substring(1)] >= 2) img.classList.add('glow');
        img.onclick = () => handleDiscard(idx);
        handEl.appendChild(img);
    });

    // Botão de Batida
    const oldBtn = document.getElementById('win-btn');
    if (isTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!oldBtn) {
            let btn = document.createElement('button');
            btn.id = 'win-btn'; btn.innerText = "BATER!";
            btn.style.cssText = "position:fixed; bottom:150px; left:50%; transform:translateX(-50%); background:gold; padding:20px; font-size:20px;";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else if (oldBtn) oldBtn.remove();

    // Baralho e Oponente
    document.getElementById('deck-img').src = cardBackPath;
    const d = gameState.descarte || [];
    document.getElementById('discard-img').src = d.length > 0 ? `Cards/Classic/${d[d.length-1]}.png` : cardBackPath;

    const oppHandEl = document.getElementById('opponent-hand');
    oppHandEl.innerHTML = "";
    const oppCards = gameState.jogadores[opp]?.mao?.length || 0;
    for(let i=0; i<oppCards; i++) {
        let img = document.createElement('img');
        img.src = cardBackPath; img.className = "card-img";
        oppHandEl.appendChild(img);
    }

    document.getElementById('decision-modal').style.display = (isTurn && gameState.estado === "decidir") ? "flex" : "none";
}

// --- AÇÕES ---
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
    let c = d.pop();
    database.ref(`salas/${roomName}`).update({ descarte: d, estado: "descartar", [`jogadores/${playerID}/mao`]: [...currentHand, c] });
};

document.getElementById('keep-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ estado: "descartar", [`jogadores/${playerID}/mao`]: [...currentHand, tempCard] });
};

document.getElementById('discard-instant-btn').onclick = () => {
    let d = [...(gameState.descarte || []), tempCard];
    let h = [...(gameState.historico || []), tempCard];
    database.ref(`salas/${roomName}`).update({ descarte: d, historico: h, estado: "comprar", turno: playerID === "p1"?"p2":"p1" });
};

function handleDiscard(idx) {
    if (gameState.turno !== playerID || gameState.estado !== "descartar") return;
    let mao = [...currentHand];
    let card = mao.splice(idx, 1)[0];
    let d = [...(gameState.descarte || []), card];
    let h = [...(gameState.historico || []), card];
    database.ref(`salas/${roomName}`).update({ descarte: d, historico: h, estado: "comprar", turno: playerID === "p1"?"p2":"p1", [`jogadores/${playerID}/mao`]: mao });
}
