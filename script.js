let database;
let auth;
let currentUser = null;

// Configurações visuais (cartas)
const cardBackPath = `Cards/Classic/Card-Back-01.png`;

// Variáveis de controle de jogo
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// Esta função garante que o Firebase já carregou antes de tentar usar o 'auth'
function inicializarSistema() {
    // Busca as instâncias criadas no firebase.js
    database = window.db || (window.firebase ? firebase.database() : null);
    auth = window.auth || (window.firebase ? firebase.auth() : null);

    if (!auth || !database) {
        console.error("Firebase não encontrado! Verifique se o firebase.js está antes do script.js no HTML.");
        return;
    }

    // Configura os botões de Login
    document.getElementById('googleLoginBtn').onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => console.error("Erro Google:", e));
    };

    document.getElementById('guestBtn').onclick = () => {
        auth.signInAnonymously().catch(e => console.error("Erro Convidado:", e));
    };

    // Monitora o estado de login
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('main-menu').style.display = 'block';
            carregarDadosUsuario(user);
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('main-menu').style.display = 'none';
        }
    });
}

// Roda assim que a página carregar
window.addEventListener('load', inicializarSistema);

function carregarDadosUsuario(user) {
    const userRef = database.ref('users/' + user.uid);
    userRef.on('value', snap => {
        let data = snap.val();
        if (!data) {
            data = {
                name: user.displayName || "Convidado",
                photo: user.photoURL || "https://via.placeholder.com/50",
                coins: 100,
                uid: user.uid
            };
            userRef.set(data);
        }
        updateProfileUI(data);
    });
    listenForInvites(user.uid);
}

// --- Funções de UI e Convites ---
function updateProfileUI(data) {
    document.getElementById('user-name').innerText = data.name;
    document.getElementById('user-photo').src = data.photo;
    document.getElementById('user-coins-display').innerText = "💰 " + data.coins;
    document.getElementById('my-uid-display').innerText = data.uid;
}

function listenForInvites(myUid) {
    database.ref(`invites/${myUid}`).on('value', snap => {
        const invite = snap.val();
        if (invite) {
            if (confirm(`Desafio de ${invite.fromName}! Aceitar duelo?`)) {
                roomName = invite.room;
                playerID = "p2";
                database.ref(`invites/${myUid}`).remove();
                enterRoom();
            }
        }
    });
}

// --- BOTÕES DO MENU ---
document.getElementById('addFriendBtn').onclick = () => {
    const friendUid = document.getElementById('addFriendInput').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return alert("ID inválido!");
    
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

document.getElementById('createBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p1";
    initRoom();
};

document.getElementById('joinBtn').onclick = () => {
    const input = document.getElementById('roomInput').value.trim();
    if (!input) return alert("Digite o nome da sala!");
    roomName = input.toLowerCase().replace(/\s+/g, '-');
    playerID = "p2";
    enterRoom();
};

// --- LOGICA DE JOGO (Mesmas funções que já funcionavam) ---
// initRoom(), enterRoom(), render(), buy(), handleDiscard()...
