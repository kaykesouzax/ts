/* Aba Converter Foto para PDF */

import { criarGrade, tornarAreaClicavel } from "/static/js/grade.js";

const MAX_DOCUMENTOS = 3;

const fpEntrada = document.getElementById("fpEntrada");
const fpEscolher = document.getElementById("fpEscolher");
const fpEnvio = document.getElementById("fpEnvio");
const fpOrganizar = document.getElementById("fpOrganizar");
const fpProcessando = document.getElementById("fpProcessando");
const fpResultado = document.getElementById("fpResultado");
const fpErro = document.getElementById("fpErro");
const gradeFotos = document.getElementById("gradeFotos");
const fpMais = document.getElementById("fpMais");
const fpProcessar = document.getElementById("fpProcessar");
const fpBaixar = document.getElementById("fpBaixar");
const fpReiniciar = document.getElementById("fpReiniciar");
const fpTamanho = document.getElementById("fpTamanho");
const fpNomeArquivo = document.getElementById("fpNomeArquivo");
const fpModoInfo = document.getElementById("fpModoInfo");
const botoesModo = document.querySelectorAll(".opcaoModo");

let jobAtual = null;
let modo = "fotos";
let reiniciando = false;

const gerenciador = criarGrade({
  elementoGrade: gradeFotos,
  aceitaPdf: false,
  aoAtualizar: (quantidade) => {
    if (quantidade === 0 && !reiniciando) reiniciarTudo();
    else atualizarAvisoLimite();
  },
});

function mostrarSecao(secao) {
  [fpEnvio, fpOrganizar, fpProcessando, fpResultado, fpErro]
    .forEach((s) => s.classList.add("oculto"));
  secao.classList.remove("oculto");
}

function mostrarErro(msg) {
  fpErro.textContent = msg;
  fpErro.classList.remove("oculto");
}

function limparErro() {
  fpErro.textContent = "";
  fpErro.classList.add("oculto");
}

/* Chave de modo */
botoesModo.forEach((botao) => {
  botao.addEventListener("click", () => {
    modo = botao.dataset.modo;
    botoesModo.forEach((b) => b.classList.toggle("opcaoAtiva", b === botao));
    fpModoInfo.textContent = modo === "documentos"
      ? "Ate 3 fotos empilhadas em uma unica pagina."
      : "Cada foto ocupa uma pagina.";
    atualizarAvisoLimite();
  });
});

function atualizarAvisoLimite() {
  const total = gerenciador.quantidade();
  if (modo === "documentos" && total > MAX_DOCUMENTOS) {
    mostrarErro(
      "Neste modo o limite e de 3 fotos por pagina. Remova " + (total - MAX_DOCUMENTOS) +
      " para continuar, ou use o modo Juncao de Fotos."
    );
    fpProcessar.disabled = true;
  } else {
    if (fpErro.textContent.startsWith("Neste modo o limite")) limparErro();
    fpProcessar.disabled = false;
  }
}

fpEscolher.addEventListener("click", () => fpEntrada.click());
tornarAreaClicavel(fpEnvio, () => fpEntrada.click());
tornarAreaClicavel(fpOrganizar, () => fpEntrada.click());
fpMais.addEventListener("click", () => fpEntrada.click());

fpEntrada.addEventListener("change", () => {
  const novos = Array.from(fpEntrada.files);
  fpEntrada.value = "";
  if (novos.length === 0) return;

  const aceitos = gerenciador.adicionar(novos);
  if (aceitos === 0 && gerenciador.quantidade() === 0) {
    mostrarErro("Envie arquivos em formato de foto.");
    return;
  }
  if (aceitos < novos.length) {
    mostrarErro("Alguns arquivos foram ignorados por nao serem fotos.");
  }

  fpEnvio.classList.add("oculto");
  fpOrganizar.classList.remove("oculto");
  atualizarAvisoLimite();
});

fpProcessar.addEventListener("click", async () => {
  const itens = gerenciador.obterItens();
  if (itens.length === 0) {
    mostrarErro("Envie ao menos uma foto.");
    return;
  }
  if (modo === "documentos" && itens.length > MAX_DOCUMENTOS) {
    atualizarAvisoLimite();
    return;
  }

  mostrarSecao(fpProcessando);

  const dados = new FormData();
  dados.append("modo", modo);
  for (const item of itens) {
    dados.append("arquivos", item.arquivo, item.arquivo.name);
  }

  try {
    const resposta = await fetch("/api/foto_para_pdf/enviar", { method: "POST", body: dados });
    const json = await resposta.json();
    if (!resposta.ok) {
      mostrarSecao(fpErro);
      fpErro.textContent = json.erro || "Nao foi possivel gerar o PDF.";
      return;
    }
    jobAtual = json.job_id;
    const plural = json.paginas === 1 ? "pagina" : "paginas";
    fpTamanho.textContent = json.paginas + " " + plural + ". Tamanho: " + json.tamanho_final;
    mostrarSecao(fpResultado);
  } catch (e) {
    mostrarSecao(fpErro);
    fpErro.textContent = "Nao foi possivel enviar as fotos. Verifique a conexao.";
  }
});

fpBaixar.addEventListener("click", () => {
  if (!jobAtual) return;
  let nome = (fpNomeArquivo.value || "").trim();
  if (nome === "") nome = "Merged img";
  window.location.href = "/api/foto_para_pdf/baixar/" + jobAtual + "?nome=" + encodeURIComponent(nome);
});

function reiniciarTudo() {
  reiniciando = true;
  jobAtual = null;
  gerenciador.limpar();
  fpEntrada.value = "";
  fpNomeArquivo.value = "Merged img";
  fpProcessar.disabled = false;
  limparErro();
  mostrarSecao(fpEnvio);
  reiniciando = false;
}

fpReiniciar.addEventListener("click", async () => {
  if (jobAtual) {
    try { await fetch("/api/foto_para_pdf/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
  }
  reiniciarTudo();
});
