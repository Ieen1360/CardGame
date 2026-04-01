// ATENÇÃO: Cole suas configurações do Firebase aqui!
const firebaseConfig = { /* SEU CONFIG */ };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

const backImg = `Cards/Classic/Card-Back-0${Math.floor(Math.random()*6)+1}.png`;

// --- LOGIN ---
document.getElementById('createBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase();
    if (!roomName) return;
    playerID = "p1";
    initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase();
    if (!roomName) return;
    playerID = "p2";
    enterRoom();
};

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    }
    deck = deck.sort(() => Math.random() - 0.5);
    
    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [deck.pop()], vencedor: null,
        jogadores: { 
            p1: { mao: deck.splice(0, 9), ativo: true }, 
            p2: { mao: deck.splice(0, 9), ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('lobby').style.display = 'none';
    const roomRef = database.ref(`salas/${roomName}`);
    
    roomRef.child(`jogadores/${playerID}`).update({ ativo: true });
    roomRef.onDisconnect().remove(); // Deleta a sala se sair

    roomRef.on('value', snap => {
        gameState = snap.val();
        if (!gameState) return location.reload();
        if (gameState.vencedor) {
            alert(gameState.vencedor === playerID ? "VOCÊ GANHOU!" : "OPONENTE GANHOU!");
            location.reload();
            return;
        }

        if (gameState.jogadores.p1.ativo && gameState.jogadores.p2.ativo) {
            document.getElementById('waiting-lobby').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            render();
        } else {
            document.getElementById('waiting-lobby').style.display = 'block';
        }
    });
}

function canWin(hand) {
    if (hand.length < 9) return false;
    const check = (c) => {
        let p = c.map(x => ({ s: x[0], v: parseInt(x.substring(1)) }));
        if (p.every(v => v.v === p[0].v)) return true;
        const s = p.sort((a,b) => a.v - b.v);
        return p.every(v => v.s === p[0].s) && (s[1].v === s[0].v+1 && s[2].v === s[1].v+1);
    };
    let h = [...hand];
    for (let i=0; i<9; i++) {
        for (let j=i+1; j<9; j++) {
            for (let k=j+1; k<9; k++) {
                if (check([h[i], h[j], h[k]])) {
                    let r1 = h.filter((_, x) => x!=i && x!=j && x!=k);
                    for (let m=0; m<6; m++) {
                        for (let n=m+1; n<6; n++) {
                            for (let o=n+1; o<6; o++) {
                                if (check([r1[m], r1[n], r1[o]])) {
                                    let last = r1.filter((_, x) => x!=m && x!=n && x!=o);
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

function render() {
    const isTurn = gameState.turno === playerID;
    document.getElementById('turn-display').innerText = isTurn ? "SEU TURNO" : "OPONENTE JOGANDO";
    document.getElementById('state-display').innerText = ` - [${gameState.estado.toUpperCase()}]`;

    currentHand = (gameState.jogadores[playerID].mao || []).sort();
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = "";
    
    let counts = {};
    currentHand.forEach(c => counts[c.substring(1)] = (counts[c.substring(1)] || 0) + 1);

    currentHand.forEach((card, idx) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${card}.png`;
        img.className = "card-img" + (counts[card.substring(1)] >= 2 ? " glow" : "");
        img.onclick = () => {
            if (isTurn && gameState.estado === "descartar") {
                let m = [...currentHand];
                let c = m.splice(idx, 1)[0];
                database.ref(`salas/${roomName}`).update({
                    descarte: [...(gameState.descarte || []), c],
                    estado: "comprar", turno: playerID === "p1" ? "p2" : "p1",
                    [`jogadores/${playerID}/mao`]: m
                });
            }
        };
        handEl.appendChild(img);
    });

    const winBtn = document.getElementById('win-btn');
    if (isTurn && gameState.estado === "descartar" && canWin(currentHand)) {
        if (!winBtn) {
            let btn = document.createElement('button');
            btn.id = "win-btn"; btn.innerText = "BATER!";
            btn.style.cssText = "position:fixed; bottom:150px; left:50%; transform:translateX(-50%); background:gold;";
            btn.onclick = () => database.ref(`salas/${roomName}`).update({ vencedor: playerID });
            document.body.appendChild(btn);
        }
    } else if (winBtn) winBtn.remove();

    document.getElementById('deck-img').src = backImg;
    const d = gameState.descarte || [];
    document.getElementById('discard-img').src = d.length > 0 ? `Cards/Classic/${d[d.length-1]}.png` : backImg;

    document.getElementById('decision-modal').style.display = (isTurn && gameState.estado === "decidir") ? "flex" : "none";
    if (tempCard) document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
}

document.getElementById('deck').onclick = () => {
    if (gameState.turno !== playerID || gameState.estado !== "comprar") return;
    let b = [...gameState.baralho];
    tempCard = b.pop();
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
    tempCard = null;
};

document.getElementById('discard-instant-btn').onclick = () => {
    database.ref(`salas/${roomName}`).update({ 
        descarte: [...(gameState.descarte || []), tempCard], 
        estado: "comprar", turno: playerID === "p1" ? "p2" : "p1" 
    });
    tempCard = null;
};
