const botaoMenu = document.getElementById("botaoMenu");
const menuLateral = document.getElementById("menuLateral");
const sobreposicao = document.getElementById("sobreposicao");

function fecharMenu() {
  menuLateral.classList.remove("aberto");
  sobreposicao.classList.remove("visivel");
}

botaoMenu.addEventListener("click", () => {
  menuLateral.classList.toggle("aberto");
  sobreposicao.classList.toggle("visivel");
});

sobreposicao.addEventListener("click", fecharMenu);

document.querySelectorAll(".itemMenu").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".itemMenu").forEach((b) => b.classList.remove("itemAtivo"));
    botao.classList.add("itemAtivo");

    document.querySelectorAll(".aba").forEach((a) => a.classList.add("oculto"));

    // abas com grade de cartoes usam a largura maior
    const abasLargas = ["juntar", "foto_para_pdf", "cdc", "placas"];
    const conteudo = document.querySelector(".conteudo");
    conteudo.classList.toggle(
      "largo",
      abasLargas.includes(botao.dataset.aba) && !botao.dataset.indisponivel
    );

    if (botao.dataset.indisponivel) {
      document.getElementById("aba_indisponivel").classList.remove("oculto");
    } else {
      const alvo = document.getElementById("aba_" + botao.dataset.aba);
      if (alvo) {
        alvo.classList.remove("oculto");
      } else {
        document.getElementById("aba_indisponivel").classList.remove("oculto");
      }
    }
    fecharMenu();
  });
});

const entradaArquivo = document.getElementById("entradaArquivo");
const botaoEscolher = document.getElementById("botaoEscolher");
const nomeArquivo = document.getElementById("nomeArquivo");
const areaEnvio = document.getElementById("areaEnvio");
const areaProcessando = document.getElementById("areaProcessando");
const areaResultado = document.getElementById("areaResultado");
const areaErro = document.getElementById("areaErro");
const alertaMetodo = document.getElementById("alertaMetodo");
const tamanhoFinal = document.getElementById("tamanhoFinal");
const botaoBaixar = document.getElementById("botaoBaixar");
const botaoReiniciar = document.getElementById("botaoReiniciar");

let jobAtual = null;
let modoCompressao = "basica";

const compModoInfo = document.getElementById("compModoInfo");
document.querySelectorAll("#aba_comprimir .opcaoModo").forEach((botao) => {
  botao.addEventListener("click", () => {
    modoCompressao = botao.dataset.modo;
    document.querySelectorAll("#aba_comprimir .opcaoModo")
      .forEach((b) => b.classList.toggle("opcaoAtiva", b === botao));
    compModoInfo.textContent = modoCompressao === "alienacao"
      ? "Reduz ao maximo para atingir 500 KB."
      : "Reducao equilibrada, sem meta de tamanho.";
  });
});

botaoEscolher.addEventListener("click", () => entradaArquivo.click());

entradaArquivo.addEventListener("change", () => {
  const arquivo = entradaArquivo.files[0];
  if (!arquivo) return;
  nomeArquivo.textContent = arquivo.name;
  enviarArquivo(arquivo);
});

function mostrarSomente(elemento) {
  [areaEnvio, areaProcessando, areaResultado, areaErro].forEach((e) => e.classList.add("oculto"));
  elemento.classList.remove("oculto");
}

async function enviarArquivo(arquivo) {
  mostrarSomente(areaProcessando);

  const dados = new FormData();
  dados.append("arquivo", arquivo);
  dados.append("modo", modoCompressao);

  try {
    const resposta = await fetch("/api/comprimir/enviar", {
      method: "POST",
      body: dados,
    });
    const json = await resposta.json();

    if (!resposta.ok) {
      areaErro.textContent = json.erro || "Ocorreu um erro ao processar o arquivo.";
      mostrarSomente(areaErro);
      return;
    }

    jobAtual = json.job_id;
    tamanhoFinal.textContent =
      "De " + json.tamanho_original + " para " + json.tamanho_final;

    const alertaMetaNao = document.getElementById("alertaMetaNao");
    alertaMetodo.classList.add("oculto");
    alertaMetaNao.classList.add("oculto");
    if (json.meta_atingida === false) {
      alertaMetaNao.classList.remove("oculto");
    } else if (json.alerta) {
      alertaMetodo.classList.remove("oculto");
    }
    mostrarSomente(areaResultado);
  } catch (erro) {
    areaErro.textContent = "Nao foi possivel enviar o arquivo. Verifique a conexao.";
    mostrarSomente(areaErro);
  }
}

botaoBaixar.addEventListener("click", () => {
  if (!jobAtual) return;
  window.location.href = "/api/comprimir/baixar/" + jobAtual;
});

botaoReiniciar.addEventListener("click", async () => {
  if (jobAtual) {
    try {
      await fetch("/api/comprimir/reiniciar/" + jobAtual, { method: "POST" });
    } catch (erro) {
      // silencioso
    }
  }
  jobAtual = null;
  entradaArquivo.value = "";
  nomeArquivo.textContent = "";
  mostrarSomente(areaEnvio);
});

/* Converter PDF para Foto */
const pfEntrada = document.getElementById("pfEntrada");
const pfEscolher = document.getElementById("pfEscolher");
const pfNome = document.getElementById("pfNome");
const pfEnvio = document.getElementById("pfEnvio");
const pfProcessando = document.getElementById("pfProcessando");
const pfResultado = document.getElementById("pfResultado");
const pfErro = document.getElementById("pfErro");
const pfInfo = document.getElementById("pfInfo");
const pfBaixar = document.getElementById("pfBaixar");
const pfReiniciar = document.getElementById("pfReiniciar");

let pfJob = null;

if (pfEscolher) {
  pfEscolher.addEventListener("click", () => pfEntrada.click());

  pfEntrada.addEventListener("change", () => {
    const arquivo = pfEntrada.files[0];
    if (!arquivo) return;
    pfNome.textContent = arquivo.name;
    pfEnviar(arquivo);
  });

  function pfMostrar(elemento) {
    [pfEnvio, pfProcessando, pfResultado, pfErro].forEach((e) => e.classList.add("oculto"));
    elemento.classList.remove("oculto");
  }

  async function pfEnviar(arquivo) {
    pfMostrar(pfProcessando);
    const dados = new FormData();
    dados.append("arquivo", arquivo);
  dados.append("modo", modoCompressao);
    try {
      const resposta = await fetch("/api/pdf_para_foto/enviar", { method: "POST", body: dados });
      const json = await resposta.json();
      if (!resposta.ok) {
        pfErro.textContent = json.erro || "Ocorreu um erro ao converter o arquivo.";
        pfMostrar(pfErro);
        return;
      }
      pfJob = json.job_id;
      if (json.tipo === "jpg") {
        pfInfo.textContent = "1 pagina convertida. Tamanho: " + json.tamanho_final;
      } else {
        pfInfo.textContent = json.paginas + " paginas convertidas. Tamanho do ZIP: " + json.tamanho_final;
      }
      pfMostrar(pfResultado);
    } catch (e) {
      pfErro.textContent = "Nao foi possivel enviar o arquivo. Verifique a conexao.";
      pfMostrar(pfErro);
    }
  }

  pfBaixar.addEventListener("click", () => {
    if (pfJob) window.location.href = "/api/pdf_para_foto/baixar/" + pfJob;
  });

  pfReiniciar.addEventListener("click", async () => {
    if (pfJob) {
      try { await fetch("/api/pdf_para_foto/reiniciar/" + pfJob, { method: "POST" }); } catch (e) {}
    }
    pfJob = null;
    pfEntrada.value = "";
    pfNome.textContent = "";
    pfMostrar(pfEnvio);
  });
}

/* Comprimir Imagens */
const ciEntrada = document.getElementById("ciEntrada");
const ciEscolher = document.getElementById("ciEscolher");
const ciNome = document.getElementById("ciNome");
const ciEnvio = document.getElementById("ciEnvio");
const ciProcessando = document.getElementById("ciProcessando");
const ciResultado = document.getElementById("ciResultado");
const ciErro = document.getElementById("ciErro");
const ciTamanho = document.getElementById("ciTamanho");
const ciDimensao = document.getElementById("ciDimensao");
const ciBaixar = document.getElementById("ciBaixar");
const ciReiniciar = document.getElementById("ciReiniciar");
const ciNomeArquivo = document.getElementById("ciNomeArquivo");
const ciSufixo = document.getElementById("ciSufixo");
const ciModoInfo = document.getElementById("ciModoInfo");
const ciAvisoSemGanho = document.getElementById("ciAvisoSemGanho");

let ciJob = null;
let ciModo = "simples";

if (ciEscolher) {
  document.querySelectorAll("#aba_comprimir_imagem .opcaoModo").forEach((botao) => {
    botao.addEventListener("click", () => {
      ciModo = botao.dataset.modo;
      document.querySelectorAll("#aba_comprimir_imagem .opcaoModo")
        .forEach((b) => b.classList.toggle("opcaoAtiva", b === botao));
      ciModoInfo.textContent = ciModo === "avancada"
        ? "Reduz mais o arquivo, mantendo o documento legivel."
        : "Mantem o tamanho original da imagem.";
    });
  });

  ciEscolher.addEventListener("click", () => ciEntrada.click());
  ciEnvio.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    ciEntrada.click();
  });

  ciEntrada.addEventListener("change", () => {
    const arquivo = ciEntrada.files[0];
    if (!arquivo) return;
    ciNome.textContent = arquivo.name;
    ciEnviar(arquivo);
  });

  function ciMostrar(elemento) {
    [ciEnvio, ciProcessando, ciResultado, ciErro].forEach((e) => e.classList.add("oculto"));
    elemento.classList.remove("oculto");
  }

  async function ciEnviar(arquivo) {
    ciMostrar(ciProcessando);
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    dados.append("modo", ciModo);
    try {
      const resposta = await fetch("/api/comprimir_imagem/enviar", { method: "POST", body: dados });
      const json = await resposta.json();
      if (!resposta.ok) {
        ciErro.textContent = json.erro || "Ocorreu um erro ao comprimir a imagem.";
        ciMostrar(ciErro);
        return;
      }
      ciJob = json.job_id;
      ciTamanho.textContent = "De " + json.tamanho_original + " para " + json.tamanho_final;
      ciDimensao.textContent = json.reduzida
        ? json.dimensao_inicial + " para " + json.dimensao_final
        : json.dimensao_final;
      ciAvisoSemGanho.classList.toggle("oculto", !json.sem_ganho);
      ciMostrar(ciResultado);
    } catch (e) {
      ciErro.textContent = "Nao foi possivel enviar a imagem. Verifique a conexao.";
      ciMostrar(ciErro);
    }
  }

  ciBaixar.addEventListener("click", () => {
    if (!ciJob) return;
    let nome = (ciNomeArquivo.value || "").trim();
    if (nome === "") nome = "Imagem Comprimida";
    window.location.href = "/api/comprimir_imagem/baixar/" + ciJob + "?nome=" + encodeURIComponent(nome);
  });

  ciReiniciar.addEventListener("click", async () => {
    if (ciJob) {
      try { await fetch("/api/comprimir_imagem/reiniciar/" + ciJob, { method: "POST" }); } catch (e) {}
    }
    ciJob = null;
    ciEntrada.value = "";
    ciNome.textContent = "";
    ciNomeArquivo.value = "Imagem Comprimida";
    ciMostrar(ciEnvio);
  });
}
