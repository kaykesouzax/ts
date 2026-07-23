/* Aba Juntar Arquivos */

import { criarGrade, tornarAreaClicavel } from "/static/js/grade.js";

const juntarEntrada = document.getElementById("juntarEntrada");
const juntarEscolher = document.getElementById("juntarEscolher");
const juntarEnvio = document.getElementById("juntarEnvio");
const juntarOrganizar = document.getElementById("juntarOrganizar");
const juntarProcessando = document.getElementById("juntarProcessando");
const juntarResultado = document.getElementById("juntarResultado");
const juntarErro = document.getElementById("juntarErro");
const elementoGrade = document.getElementById("grade");
const juntarMais = document.getElementById("juntarMais");
const juntarProcessar = document.getElementById("juntarProcessar");
const juntarBaixar = document.getElementById("juntarBaixar");
const juntarReiniciar = document.getElementById("juntarReiniciar");
const juntarTamanho = document.getElementById("juntarTamanho");
const juntarNomeArquivo = document.getElementById("juntarNomeArquivo");
const juntarVoltar = document.getElementById("juntarVoltar");

let jobAtual = null;
let reiniciando = false;

const gerenciador = criarGrade({
  elementoGrade,
  aceitaPdf: true,
  aoAtualizar: (quantidade) => {
    // volta para a tela inicial quando o ultimo cartao e removido
    if (quantidade === 0 && !reiniciando) reiniciarTudo();
  },
});

function mostrarSecao(secao) {
  [juntarEnvio, juntarOrganizar, juntarProcessando, juntarResultado, juntarErro]
    .forEach((s) => s.classList.add("oculto"));
  secao.classList.remove("oculto");
}

function mostrarErro(msg) {
  juntarErro.textContent = msg;
  juntarErro.classList.remove("oculto");
}

juntarEscolher.addEventListener("click", () => juntarEntrada.click());
tornarAreaClicavel(juntarEnvio, () => juntarEntrada.click());
tornarAreaClicavel(juntarOrganizar, () => juntarEntrada.click());
juntarMais.addEventListener("click", () => juntarEntrada.click());

juntarEntrada.addEventListener("change", () => {
  const novos = Array.from(juntarEntrada.files);
  juntarEntrada.value = "";
  if (novos.length === 0) return;

  const aceitos = gerenciador.adicionar(novos);
  if (aceitos === 0 && gerenciador.quantidade() === 0) {
    mostrarErro("Envie arquivos em PDF ou foto.");
    return;
  }

  juntarEnvio.classList.add("oculto");
  juntarErro.classList.add("oculto");
  juntarOrganizar.classList.remove("oculto");
});

juntarProcessar.addEventListener("click", async () => {
  const itens = gerenciador.obterItens();
  if (itens.length < 2) {
    mostrarErro("Envie ao menos dois arquivos para juntar.");
    return;
  }
  mostrarSecao(juntarProcessando);

  const dados = new FormData();
  for (const item of itens) {
    dados.append("arquivos", item.arquivo, item.arquivo.name);
  }

  try {
    const resposta = await fetch("/api/juntar/enviar", { method: "POST", body: dados });
    const json = await resposta.json();
    if (!resposta.ok) {
      mostrarSecao(juntarErro);
      juntarErro.textContent = json.erro || "Nao foi possivel juntar os arquivos.";
      return;
    }
    jobAtual = json.job_id;
    juntarTamanho.textContent = "Tamanho final: " + json.tamanho_final;
    mostrarSecao(juntarResultado);
  } catch (e) {
    mostrarSecao(juntarErro);
    juntarErro.textContent = "Nao foi possivel enviar os arquivos. Verifique a conexao.";
  }
});

juntarBaixar.addEventListener("click", () => {
  if (!jobAtual) return;
  let nome = (juntarNomeArquivo.value || "").trim();
  if (nome === "") nome = "Merged doc";
  window.location.href = "/api/juntar/baixar/" + jobAtual + "?nome=" + encodeURIComponent(nome);
});

juntarVoltar.addEventListener("click", async () => {
  // volta para a organizacao mantendo os arquivos; descarta o resultado anterior
  if (jobAtual) {
    try { await fetch("/api/juntar/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
    jobAtual = null;
  }
  mostrarSecao(juntarOrganizar);
});

function reiniciarTudo() {
  reiniciando = true;
  jobAtual = null;
  gerenciador.limpar();
  juntarEntrada.value = "";
  juntarNomeArquivo.value = "Merged doc";
  mostrarSecao(juntarEnvio);
  reiniciando = false;
}

juntarReiniciar.addEventListener("click", async () => {
  if (jobAtual) {
    try { await fetch("/api/juntar/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
  }
  reiniciarTudo();
});
