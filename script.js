let database;
let auth;
let currentUser = null;

// Verso de carta aleatório
const randomBackNum = Math.floor(Math.random() * 6) + 1;
const cardBackPath = `Cards/Classic/Card-Back-0${randomBackNum}.png`;

// Inicializa o Firebase usando o que já está no firebase.js
window.onload = () => { 
    database = window.db || firebase.database(); 
    auth = firebase.auth();

    // Listener de Autenticação: detecta se o usuário logou
    auth.onAuthStateChanged(user => {
        if (user) {
            handleAuth(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('main-menu').style.display = 'none';
        }
    });
};

// --- SISTEMA DE LOGIN ---
document.getElementById('googleLoginBtn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
};

document.getElementById('guestBtn').onclick = () => {
    auth.signInAnonymously();
};

function handleAuth(user) {
    currentUser = user;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    
    const userRef = database.ref('users/' + user.uid);
    
    // Sincroniza dados do perfil (Moedas, Nome, etc)
    userRef.on('value', snap => {
        let data = snap.val();
        if (!data) {
            data = {
                name: user.displayName || "Convidado",
                photo: user.photoURL || "https://via.placeholder.com/50",
                coins: 200,
                uid: user.uid
            };
            userRef.set(data);
        }
        updateProfileUI(data);
    });

    // Escuta Convites de Duelo em tempo real
    listenForInvites(user.uid);
}

function updateProfileUI(data) {
    document.getElementById('user-name').innerText = data.name;
    document.getElementById('user-photo').src = data.photo;
    document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
    document.getElementById('my-uid-display').innerText = data.uid;
}

// --- LOGICA DE DUELO / AMIGOS ---
function listenForInvites(myUid) {
    database.ref(`invites/${myUid}`).on('value', snap => {
        const invite = snap.val();
        if (invite) {
            if (confirm(`Desafio de ${invite.fromName}! Aceitar aposta de 50 moedas?`)) {
                roomName = invite.room;
                playerID = "p2";
                database.ref(`invites/${myUid}`).remove();
                enterRoom();
            }
        }
    });
}

document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return alert("ID inválido");
    
    // Envia convite de duelo direto
    const inviteData = {
        fromName: currentUser.displayName || "Convidado",
        fromUid: currentUser.uid,
        room: "duelo-" + Math.random().toString(36).substring(7)
    };
    
    database.ref(`invites/${friendUid}`).set(inviteData).then(() => {
        alert("Desafio enviado!");
        roomName = inviteData.room;
        playerID = "p1";
        initRoom();
    });
};

// --- LOGICA DO JOGO (PIFE) ---
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Nome da sala!");
    
    // Verifica se tem moedas antes de criar
    database.ref(`users/${currentUser.uid}/coins`).once('value', snap => {
        if ((snap.val() || 0) < 50) return alert("Moedas insuficientes!");
        roomName = input.toLowerCase().replace(/\s+/g, '-');
        playerID = "p1";
        initRoom();
    });
};

function initRoom() {
    const suits = ['h', 'd', 'c', 's'];
    let deck = [];
    for (let s of suits) {
        for (let i = 1; i <= 13; i++) deck.push(s + i.toString().padStart(2, '0'));
    }
    deck = deck.sort(() => Math.random() - 0.5);
    
    const p1Hand = deck.splice(0, 9);
    const p2Hand = deck.splice(0, 9);

    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", baralho: deck, descarte: [deck.pop()], 
        aposta: 50, vencedor: null,
        jogadores: { 
            p1: { uid: currentUser.uid, mao: p1Hand, ativo: true }, 
            p2: { uid: "", mao: p2Hand, ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('main-menu').style.display = 'none';
    const roomRef = database.ref(`salas/${roomName}`);
    
    if (playerID === "p2") {
        roomRef.child('jogadores/p2').update({ uid: currentUser.uid, ativo: true });
    }

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) { location.reload(); return; }
        
        if (gameState.vencedor) {
            handleVictory(gameState.vencedor);
            return;
        }

        if (gameState.jogadores.p1.ativo && gameState.jogadores.p2.ativo) {
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

function handleVictory(vid) {
    const isWinner = (playerID === vid);
    const aposta = gameState.aposta || 50;

    // Sistema de Moedas: Transação segura
    database.ref(`users/${currentUser.uid}/coins`).transaction(current => {
        return isWinner ? (current || 0) + aposta : (current || 0) - aposta;
    });

    alert(isWinner ? `VOCÊ GANHOU ${aposta} MOEDAS!` : `VOCÊ PERDEU ${aposta} MOEDAS.`);
    
    setTimeout(() => {
        database.ref(`salas/${roomName}`).remove();
        location.reload();
    }, 2000);
}

// Funções de Renderização e Regras (isValidGroup, canWin, handleDiscard)
// Continuam as mesmas da sua versão estável anterior...
