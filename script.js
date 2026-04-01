let database;
let auth;
let currentUser = null;

// Configurações visuais
const randomBackNum = Math.floor(Math.random() * 6) + 1;
const cardBackPath = `Cards/Classic/Card-Back-0${randomBackNum}.png`;

// Variáveis de controle
let roomName = "";
let playerID = ""; 
let gameState = null;
let currentHand = [];
let tempCard = null;

// FUNÇÃO DE INICIALIZAÇÃO SEGURA
function initApp() {
    // Tenta pegar o database do window (definido no seu firebase.js) ou do firebase global
    database = window.db || firebase.database();
    auth = firebase.auth();

    console.log("Firebase carregado com sucesso.");

    // Detecta se o usuário já está logado ou se logou agora
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log("Usuário detectado:", user.uid);
            handleAuth(user);
        } else {
            console.log("Nenhum usuário logado.");
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('main-menu').style.display = 'none';
        }
    });

    // Atribui os eventos aos botões apenas após o carregamento
    document.getElementById('googleLoginBtn').onclick = loginGoogle;
    document.getElementById('guestBtn').onclick = loginGuest;
}

// Aguarda o carregamento total da página e dos scripts externos
window.addEventListener('load', initApp);

// --- FUNÇÕES DE LOGIN ---
function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Erro no login Google:", error);
        alert("Erro ao logar com Google. Verifique se ativou no console do Firebase.");
    });
}

function loginGuest() {
    auth.signInAnonymously().catch(error => {
        console.error("Erro no login convidado:", error);
        alert("Erro ao entrar como convidado. Verifique se ativou no console do Firebase.");
    });
}

function handleAuth(user) {
    currentUser = user;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    
    const userRef = database.ref('users/' + user.uid);
    
    // Sincroniza dados do perfil
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

// --- RESTO DO CÓDIGO (Igual ao anterior) ---

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

// Botões de ação do menu
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

// --- FUNÇÕES DE JOGO (Mantenha as mesmas: initRoom, enterRoom, render, buy, etc.) ---
// ... (Copie as funções de lógica de cartas do script anterior aqui)
