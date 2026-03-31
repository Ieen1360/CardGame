const firebaseConfig = {
  apiKey: "AIzaSyAMdBDtEDuV23aJelAMlslqEoikZ6VXMIU",
  authDomain: "cardgame-e2501.firebaseapp.com",
  databaseURL: "https://cardgame-e2501-default-rtdb.firebaseio.com",
  projectId: "cardgame-e2501",
  storageBucket: "cardgame-e2501.appspot.com",
  messagingSenderId: "45522667511",
  appId: "1:45522667511:web:55242fdc999ff84fa290f2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();