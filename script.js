// CONFIGURAÇÃO FIREBASE (Substitua pela sua!)
const firebaseConfig = { /* SEU CONFIG AQUI */ };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let roomName = "";
let playerID = "";
let currentHand = [];
let tempCard = null;
const mySid = localStorage.getItem('p_sid') || Math.random().toString(36).substring(7);
localStorage.setItem('p_sid', mySid);

const backImg = `Cards/Classic/Card-Back-0${Math.floor(Math.random()*6)+1}.png`;

// --- BOTÕES INICIAIS ---
document.getElementById('createBtn').onclick = () => start("p1");
document.getElementById('joinBtn').onclick = () => start("p2");

function start(role) {
    const input = document.getElementById('roomInput').value.trim().toLowerCase();
    if (!input) return alert("Nome da sala!");
    roomName = input;
    playerID = role;
    
    if (role === "p1") {
        const deck = Array.from({length: 52}, (_, i) => ['h','d','c','s'][i%4] + (Math.floor(i/4)+1).toString().padStart(2,'0')).sort(()=>Math.random()-0.5);
        database.ref('salas/'+roomName).set({
            turno: "p1", estado: "comprar", baralho: deck, vencedor: null,
            pontos: {p1:0, p2:0}, historico: [""],
            jogadores: {
                p1: {mao: deck.splice(0,9), sid: mySid, ativo: true},
                p2: {mao: deck.splice(0,9), sid: "", ativo: false}
            },
            descarte: [deck.pop()]
        }).then(listen);
    } else {
        database.ref('salas/'+roomName+'/jogadores/p2').update({sid: mySid, ativo: true}).then(listen);
    }
}

function listen() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    database.ref('salas/'+roomName).on('value', snap => {
        const data = snap.val();
        if (!data) return location.reload();
        
        if (data.vencedor) return handleVictory(data.vencedor, data.pontos);
        
        render(data);
    });
}

function render(data) {
    const isTurn = data.turno === playerID;
    document.getElementById('turn-display').innerText = isTurn ? "SEU TURNO" : "TURNO DO OUTRO";
    document.getElementById('turn-display').style.color = isTurn ? "#2ecc71" : "#e74c3c";
    
    document.getElementById('my-score').innerText = data.pontos[playerID];
    document.getElementById('opp-score').innerText = data.pontos[playerID === "p1" ? "p2" : "p1"];

    // Mão
    currentHand = (data.jogadores[playerID].mao || []).sort();
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = "";
    
    let counts = {};
    currentHand.forEach(c => counts[c.substring(1)] = (counts[c.substring(1)]||0)+1);

    currentHand.forEach((c, i) => {
        const img = document.createElement('img');
        img.src = `Cards/Classic/${c}.png`;
        img.className = "card-img" + (counts[c.substring(1)] >= 2 ? " glow" : "");
        img.onclick = () => discard(data, i);
        handEl.appendChild(img);
    });

    // Baralho / Descarte
    document.getElementById('deck-img').src = backImg;
    const disc = data.descarte || [];
    document.getElementById('discard-img').src = disc.length > 0 ? `Cards/Classic/${disc[disc.length-1]}.png` : backImg;
    
    // Histórico
    document.getElementById('history-list').innerText = (data.historico || []).slice(-5).join(", ");

    // Modais
    document.getElementById('decision-modal').style.display = (isTurn && data.estado === "decidir") ? "flex" : "none";
    if (tempCard) document.getElementById('drawn-card-img').src = `Cards/Classic/${tempCard}.png`;
}

// --- AÇÕES ---
document.getElementById('deck').onclick = () => {
    database.ref('salas/'+roomName).once('value', snap => {
        const data = snap.val();
        if (data.turno !== playerID || data.estado !== "comprar") return;
        let b = [...data.baralho];
        tempCard = b.pop();
        database.ref('salas/'+roomName).update({baralho: b, estado: "decidir"});
    });
};

document.getElementById('discard-pile').onclick = () => {
    database.ref('salas/'+roomName).once('value', snap => {
        const data = snap.val();
        if (data.turno !== playerID || data.estado !== "comprar") return;
        let d = [...data.descarte];
        if (d.length === 0) return;
        let c = d.pop();
        database.ref('salas/'+roomName).update({
            descarte: d, estado: "descartar",
            [`jogadores/${playerID}/mao`]: [...currentHand, c]
        });
    });
};

document.getElementById('keep-btn').onclick = () => {
    database.ref('salas/'+roomName).update({
        estado: "descartar",
        [`jogadores/${playerID}/mao`]: [...currentHand, tempCard]
    });
    tempCard = null;
};

document.getElementById('discard-instant-btn').onclick = () => {
    database.ref('salas/'+roomName).once('value', snap => {
        const d = [...(snap.val().descarte || []), tempCard];
        const h = [...(snap.val().historico || []), tempCard];
        database.ref('salas/'+roomName).update({
            descarte: d, historico: h, estado: "comprar", 
            turno: playerID === "p1" ? "p2" : "p1"
        });
        tempCard = null;
    });
};

function discard(data, i) {
    if (data.turno !== playerID || data.estado !== "descartar") return;
    let mao = [...currentHand];
    let card = mao.splice(i, 1)[0];
    database.ref('salas/'+roomName).update({
        descarte: [...(data.descarte || []), card],
        historico: [...(data.historico || []), card],
        estado: "comprar",
        turno: playerID === "p1" ? "p2" : "p1",
        [`jogadores/${playerID}/mao`]: mao
    });
}
