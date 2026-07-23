/* Aba Juncao de Arquivos CDC */

import { criarGrade, contarPaginas, tornarAreaClicavel } from "/static/js/grade.js";

const cdcFormulario = document.getElementById("cdcFormulario");
const cdcConfirmacao = document.getElementById("cdcConfirmacao");
const cdcProcessando = document.getElementById("cdcProcessando");
const cdcResultado = document.getElementById("cdcResultado");
const cdcErro = document.getElementById("cdcErro");
const cdcGerar = document.getElementById("cdcGerar");
const cdcLimpar = document.getElementById("cdcLimpar");
const cdcBaixar = document.getElementById("cdcBaixar");
const cdcReiniciar = document.getElementById("cdcReiniciar");
const cdcTamanho = document.getElementById("cdcTamanho");
const cdcNomeArquivo = document.getElementById("cdcNomeArquivo");
const cdcFaltantes = document.getElementById("cdcFaltantes");
const cdcConfirmarSim = document.getElementById("cdcConfirmarSim");
const cdcConfirmarNao = document.getElementById("cdcConfirmarNao");
const cdcVoltar = document.getElementById("cdcVoltar");

let jobAtual = null;
const campos = [];

function mostrarSecao(secao) {
  [cdcFormulario, cdcConfirmacao, cdcProcessando, cdcResultado, cdcErro]
    .forEach((s) => s && s.classList.add("oculto"));
  if (secao) secao.classList.remove("oculto");
}

/* Monta um campo (dropdown com a grade de cartoes dentro) */
document.querySelectorAll(".campoCdc").forEach((elemento) => {
  const id = elemento.dataset.campo;
  const nome = elemento.dataset.nome;
  const obrigatorio = elemento.dataset.obrigatorio === "1";
  const paginasEsperadas = elemento.dataset.paginas ? parseInt(elemento.dataset.paginas, 10) : null;
  const avisoApenasAcima = elemento.dataset.avisoAcima === "1";

  const cabecalho = elemento.querySelector(".cabecalhoCampo");
  const corpo = elemento.querySelector(".corpoCampo");
  const entrada = elemento.querySelector(".entradaCampo");
  const elementoGrade = elemento.querySelector(".gradeCampo");
  const contador = elemento.querySelector(".contadorCampo");
  const aviso = elemento.querySelector(".avisoPaginas");
  const botaoAnexar = elemento.querySelector(".botaoAnexar");

  const gerenciador = criarGrade({
    elementoGrade,
    aceitaPdf: true,
    aoAtualizar: () => atualizarResumo(),
  });

  async function atualizarResumo() {
    const itens = gerenciador.obterItens();
    const quantidade = itens.length;

    if (quantidade === 0) {
      contador.textContent = "vazio";
      contador.classList.remove("contadorPreenchido");
      aviso.classList.add("oculto");
      return;
    }

    contador.textContent = quantidade === 1 ? "1 arquivo" : quantidade + " arquivos";
    contador.classList.add("contadorPreenchido");

    if (paginasEsperadas === null) {
      aviso.classList.add("oculto");
      return;
    }

    // soma as paginas de todos os arquivos anexados no campo
    let total = 0;
    for (const item of itens) {
      total += await contarPaginas(item.arquivo, item.ehFoto);
    }

    const plural = paginasEsperadas === 1 ? "pagina" : "paginas";

    if (avisoApenasAcima) {
      // avisa somente quando passa do maximo esperado
      if (total > paginasEsperadas) {
        aviso.textContent =
          nome + " deveria ter no maximo " + paginasEsperadas + " " + plural +
          ", encontrei " + total + ".";
        aviso.classList.remove("oculto");
      } else {
        aviso.classList.add("oculto");
      }
      return;
    }

    if (total !== paginasEsperadas) {
      aviso.textContent =
        nome + " deveria ter " + paginasEsperadas + " " + plural +
        ", encontrei " + total + ".";
      aviso.classList.remove("oculto");
    } else {
      aviso.classList.add("oculto");
    }
  }

  cabecalho.addEventListener("click", () => {
    const fechado = corpo.classList.contains("oculto");
    corpo.classList.toggle("oculto", !fechado);
    elemento.classList.toggle("campoAberto", fechado);
  });

  botaoAnexar.addEventListener("click", () => entrada.click());
  tornarAreaClicavel(corpo, () => entrada.click());

  entrada.addEventListener("change", () => {
    const novos = Array.from(entrada.files);
    entrada.value = "";
    if (novos.length === 0) return;
    gerenciador.adicionar(novos);
  });

  campos.push({
    id,
    nome,
    obrigatorio,
    gerenciador,
    abrir: () => {
      corpo.classList.remove("oculto");
      elemento.classList.add("campoAberto");
    },
    limpar: () => {
      gerenciador.limpar();
      corpo.classList.add("oculto");
      elemento.classList.remove("campoAberto");
    },
  });
});

function faltandoObrigatorios() {
  return campos.filter((c) => c.obrigatorio && c.gerenciador.quantidade() === 0);
}

function totalAnexado() {
  return campos.reduce((soma, c) => soma + c.gerenciador.quantidade(), 0);
}

cdcGerar.addEventListener("click", () => {
  cdcErro.classList.add("oculto");

  if (totalAnexado() === 0) {
    cdcErro.textContent = "Anexe ao menos um documento.";
    cdcErro.classList.remove("oculto");
    return;
  }

  const faltando = faltandoObrigatorios();
  if (faltando.length > 0) {
    cdcFaltantes.textContent = "Sem anexo: " + faltando.map((c) => c.nome).join(", ") + ".";
    mostrarSecao(cdcConfirmacao);
    return;
  }

  enviar();
});

/* Nao: volta para o formulario mantendo tudo o que ja foi anexado */
cdcConfirmarNao.addEventListener("click", () => {
  mostrarSecao(cdcFormulario);
  const faltando = faltandoObrigatorios();
  if (faltando.length > 0) faltando[0].abrir();
});

cdcConfirmarSim.addEventListener("click", () => enviar());

async function enviar() {
  mostrarSecao(cdcProcessando);

  const dados = new FormData();
  for (const campo of campos) {
    for (const item of campo.gerenciador.obterItens()) {
      dados.append("campo_" + campo.id, item.arquivo, item.arquivo.name);
    }
  }

  try {
    const resposta = await fetch("/api/cdc/enviar", { method: "POST", body: dados });
    const json = await resposta.json();
    if (!resposta.ok) {
      mostrarSecao(cdcErro);
      cdcErro.textContent = json.erro || "Nao foi possivel gerar o arquivo.";
      return;
    }
    jobAtual = json.job_id;
    const plural = json.paginas === 1 ? "pagina" : "paginas";
    cdcTamanho.textContent = json.paginas + " " + plural + ". Tamanho: " + json.tamanho_final;
    mostrarSecao(cdcResultado);
  } catch (e) {
    mostrarSecao(cdcErro);
    cdcErro.textContent = "Nao foi possivel enviar os arquivos. Verifique a conexao.";
  }
}

cdcBaixar.addEventListener("click", () => {
  if (!jobAtual) return;
  let nome = (cdcNomeArquivo.value || "").trim();
  if (nome === "") nome = "CDC";
  window.location.href = "/api/cdc/baixar/" + jobAtual + "?nome=" + encodeURIComponent(nome);
});

cdcVoltar.addEventListener("click", async () => {
  // volta ao formulario mantendo tudo; descarta o resultado anterior
  if (jobAtual) {
    try { await fetch("/api/cdc/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
    jobAtual = null;
  }
  mostrarSecao(cdcFormulario);
});

function limparTudo() {
  jobAtual = null;
  campos.forEach((c) => c.limpar());
  cdcNomeArquivo.value = "CDC";
  cdcErro.classList.add("oculto");
  mostrarSecao(cdcFormulario);
}

cdcLimpar.addEventListener("click", limparTudo);

cdcReiniciar.addEventListener("click", async () => {
  if (jobAtual) {
    try { await fetch("/api/cdc/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
  }
  limparTudo();
});
