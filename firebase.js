// Configurações do seu projeto
const firebaseConfig = {
    apiKey: "AIzaSyAMdBDtEDuV23aJelAMlslqEoikZ6VXMIU",
    authDomain: "cardgame-e2501.firebaseapp.com",
    databaseURL: "https://cardgame-e2501-default-rtdb.firebaseio.com",
    projectId: "cardgame-e2501",
    storageBucket: "cardgame-e2501.appspot.com",
    messagingSenderId: "45522667511",
    appId: "1:45522667511:web:55242fdc999ff84fa290f2"
};

// Inicializa o Firebase apenas se não houver um app rodando
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Exporta para o escopo global (isso resolve o "auth is not defined")
window.auth = firebase.auth();
window.database = firebase.database();
