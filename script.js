let sala = "";
let playerId = "";

const naipes = ["h","d","c","s"];
const valores = ["01","02","03","04","05","06","07","08","09","10","11","12","13"];

function criarBaralho() {
    let baralho = [];

    naipes.forEach(n => {
        valores.forEach(v => {
            baralho.push({id: n+v, valor: parseInt(v)});
        });
    });

    return baralho;
}

function embaralhar(baralho) {
    for (let i = baralho.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
}

function entrarSala() {
    sala = document.getElementById("salaInput").value;

    const ref = db.ref("salas/" + sala);

    ref.once("value").then(snapshot => {
        let data = snapshot.val();

        if (!data) {
            // cria sala
            let baralho = criarBaralho();
            embaralhar(baralho);

            let p1 = baralho.splice(0,7);
            let p2 = baralho.splice(0,7);

            playerId = "p1";

            ref.set({
                jogadores: {
                    p1: {mao: p1},
                    p2: {mao: p2}
                },
                turno: "p1",
                baralho: baralho,
                descarte: []
            });

        } else {
            playerId = "p2";
        }

        ouvirSala();
    });
}

function ouvirSala() {
    db.ref("salas/" + sala).on("value", snap => {
        let data = snap.val();
        if (!data) return;

        let minhaMao = data.jogadores[playerId]?.mao || [];

        renderizar(minhaMao);

        document.getElementById("turno").innerText =
            data.turno === playerId ? "SEU TURNO" : "TURNO DO OPONENTE";

        let topo = data.descarte[data.descarte.length - 1];

        if (topo) {
            document.getElementById("descarteTopo").src =
                `Cards/Classic/${topo.id}.png`;
        } else {
            document.getElementById("descarteTopo").src = "";
        }
    });
}

function renderizar(mao) {
    let div = document.getElementById("mao");
    div.innerHTML = "";

    mao.forEach((carta, i) => {
        let img = document.createElement("img");
        img.src = `Cards/Classic/${carta.id}.png`;
        img.width = 80;

        img.onclick = () => descartar(i);

        div.appendChild(img);
    });
}

function comprar() {
    const ref = db.ref("salas/" + sala);

    ref.transaction(data => {
        if (!data) return data;
        if (data.turno !== playerId) return data;

        if (data.baralho.length > 0) {
            let carta = data.baralho.pop();
            data.jogadores[playerId].mao.push(carta);
        }

        return data;
    });
}

function pegarDescarte() {
    const ref = db.ref("salas/" + sala);

    ref.transaction(data => {
        if (!data) return data;
        if (data.turno !== playerId) return data;

        let carta = data.descarte.pop();
        if (carta) {
            data.jogadores[playerId].mao.push(carta);
        }

        return data;
    });
}

function descartar(index) {
    const ref = db.ref("salas/" + sala);

    ref.transaction(data => {
        if (!data) return data;
        if (data.turno !== playerId) return data;

        let mao = data.jogadores[playerId].mao;

        if (index >= 0 && index < mao.length) {
            let carta = mao.splice(index, 1)[0];
            data.descarte.push(carta);

            // troca turno
            data.turno = (data.turno === "p1") ? "p2" : "p1";
        }

        return data;
    });
}