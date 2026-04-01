// CONFIGURAÇÃO DO FIREBASE (Coloque seus dados aqui)
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    databaseURL: "https://SEU_PROJETO.firebaseio.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "ID",
    appId: "APP_ID"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

const backImg = `Cards/Classic/Card-Back-01.png`;

// --- SISTEMA DE LOGIN ---
document.getElementById('googleLoginBtn').onclick = () => {
    auth.signInWithPopup(provider).then(res => handleAuth(res.user));
};

document.getElementById('guestBtn').onclick = () => {
    auth.signInAnonymously().then(res => handleAuth(res.user));
};

function handleAuth(user) {
    currentUser = user;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    
    // Inicializa dados do usuário no banco
    const userRef = database.ref('users/' + user.uid);
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
        updateUI(data);
    });
}

function updateUI(data) {
    document.getElementById('user-name').innerText = data.name;
    document.getElementById('user-photo').src = data.photo;
    document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
    document.getElementById('my-uid-display').innerText = data.uid;
}

function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

// --- SISTEMA DE JOGO & MOEDAS ---
document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Dê um nome à sala!");
    
    database.ref('users/' + currentUser.uid + '/coins').get().then(snap => {
        if (snap.val() < 50) return alert("Moedas insuficientes! (Custo: 50)");
        
        roomName = input.toLowerCase();
        playerID = "p1";
        initRoom();
    });
};

document.getElementById('joinBtn').onclick = () => {
    roomName = document.getElementById('roomInput').value.trim().toLowerCase();
    playerID = "p2";
    enterRoom();
};

function initRoom() {
    const deck = generateDeck(); // Função de criar deck embaralhado
    const p1Hand = deck.splice(0, 9);
    const p2Hand = deck.splice(0, 9);
    
    database.ref('salas/' + roomName).set({
        turno: "p1", estado: "comprar", 
        baralho: deck, descarte: [deck.pop()],
        aposta: 50,
        jogadores: { 
            p1: { name: currentUser.displayName, uid: currentUser.uid, mao: p1Hand, ativo: true }, 
            p2: { name: "", uid: "", mao: p2Hand, ativo: false } 
        }
    }).then(enterRoom);
}

function enterRoom() {
    document.getElementById('main-menu').style.display = 'none';
    const roomRef = database.ref(`salas/${roomName}`);
    
    if (playerID === "p2") {
        roomRef.child('jogadores/p2').update({ 
            name: currentUser.displayName || "Convidado", 
            uid: currentUser.uid, 
            ativo: true 
        });
    }

    roomRef.on('value', snapshot => {
        gameState = snapshot.val();
        if (!gameState) return;
        
        if (gameState.vencedor) {
            handleEndGame(gameState.vencedor);
            return;
        }

        if (gameState.jogadores.p1.ativo && gameState.jogadores.p2.ativo) {
            document.getElementById('game-container').style.display = 'flex';
            render();
        }
    });
}

function handleEndGame(vid) {
    const v_uid = gameState.jogadores[vid].uid;
    const aposta = gameState.aposta;

    if (currentUser.uid === v_uid) {
        alert("VOCÊ VENCEU E GANHOU " + (aposta * 2) + " MOEDAS!");
        // Adiciona moedas ao vencedor
        database.ref('users/' + v_uid + '/coins').transaction(c => (c || 0) + (aposta * 2));
    } else {
        alert("VOCÊ PERDEU " + aposta + " MOEDAS.");
        // Remove moedas de quem perdeu (já foi removido na entrada ou remove agora)
        database.ref('users/' + currentUser.uid + '/coins').transaction(c => (c || 0) - aposta);
    }

    database.ref(`salas/${roomName}`).remove();
    location.reload();
}

// --- SISTEMA DE AMIGOS (Simples) ---
document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (friendUid === currentUser.uid) return alert("Você não pode ser seu próprio amigo!");
    
    database.ref(`users/${currentUser.uid}/friends/${friendUid}`).set(true);
    alert("Amigo adicionado!");
};

// --- RENDER & REGRAS (Aproveite o código que já funciona) ---
// Use suas funções canWin(), isValidGroup(), handleDiscard() do código anterior aqui.
