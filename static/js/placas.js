/* Aba Placas */

import { criarGrade, tornarAreaClicavel } from "/static/js/grade.js";

const MAX_IDENTIFICACAO = 4;
const AVISO_IDENTIFICACAO = 4;

const CAMPOS = JSON.parse(document.getElementById("dadosCamposPlacas").textContent);

const placasFormulario = document.getElementById("placasFormulario");
const placasConfirmacao = document.getElementById("placasConfirmacao");
const placasProcessando = document.getElementById("placasProcessando");
const placasResultado = document.getElementById("placasResultado");
const placasErro = document.getElementById("placasErro");
const placasCampos = document.getElementById("placasCampos");
const placasClienteLido = document.getElementById("placasClienteLido");
const placasAdicionar = document.getElementById("placasAdicionar");
const placasListaArea = document.getElementById("placasListaArea");
const placasLista = document.getElementById("placasLista");
const placasGerar = document.getElementById("placasGerar");
const placasLimpar = document.getElementById("placasLimpar");
const placasBaixar = document.getElementById("placasBaixar");
const placasVoltar = document.getElementById("placasVoltar");
const placasReiniciar = document.getElementById("placasReiniciar");
const placasTamanho = document.getElementById("placasTamanho");
const placasNomeArquivo = document.getElementById("placasNomeArquivo");
const placasTextoConfirmacao = document.getElementById("placasTextoConfirmacao");
const placasConfirmarSim = document.getElementById("placasConfirmarSim");
const placasConfirmarNao = document.getElementById("placasConfirmarNao");
const modelo = document.getElementById("modeloCampoPlaca");

let tipoAtual = "pf";
let processoAtual = "vista";
let camposMontados = [];
let clientes = [];
let jobAtual = null;
let acaoConfirmada = null;

function nomeZipPadrao() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return "PLACAS " + dia + "." + mes;
}

function mostrarSecao(secao) {
  [placasFormulario, placasConfirmacao, placasProcessando, placasResultado]
    .forEach((s) => s.classList.add("oculto"));
  secao.classList.remove("oculto");
}

function mostrarErro(msg) {
  placasErro.textContent = msg;
  placasErro.classList.remove("oculto");
}

function limparErro() {
  placasErro.textContent = "";
  placasErro.classList.add("oculto");
}

/* Chaves de tipo e de processo */
document.querySelectorAll("#placasFormulario .opcaoModo[data-tipo]").forEach((botao) => {
  botao.addEventListener("click", () => {
    if (tipoAtual === botao.dataset.tipo) return;
    tipoAtual = botao.dataset.tipo;
    document.querySelectorAll("#placasFormulario .opcaoModo[data-tipo]")
      .forEach((b) => b.classList.toggle("opcaoAtiva", b === botao));
    montarCampos();
  });
});

document.querySelectorAll("#placasFormulario .opcaoModo[data-processo]").forEach((botao) => {
  botao.addEventListener("click", () => {
    processoAtual = botao.dataset.processo;
    document.querySelectorAll("#placasFormulario .opcaoModo[data-processo]")
      .forEach((b) => b.classList.toggle("opcaoAtiva", b === botao));
  });
});

/* Monta os campos conforme o tipo escolhido */
function montarCampos(preservar = true) {
  // guarda o que ja foi anexado para nao perder ao trocar de tipo
  const anexados = {};
  if (preservar) {
    for (const montado of camposMontados) {
      const itens = montado.gerenciador.obterItens();
      if (itens.length > 0) anexados[montado.id] = itens.map((i) => i.arquivo);
    }
  }

  placasCampos.innerHTML = "";
  camposMontados = [];

  for (const campo of CAMPOS[tipoAtual]) {
    const no = modelo.content.cloneNode(true);
    const elemento = no.querySelector(".campoPlaca");
    elemento.dataset.campo = campo.id;
    elemento.querySelector(".tituloCampo").textContent = campo.rotulo;

    const cabecalho = elemento.querySelector(".cabecalhoCampo");
    const corpo = elemento.querySelector(".corpoCampo");
    const entrada = elemento.querySelector(".entradaCampo");
    const elementoGrade = elemento.querySelector(".gradeCampo");
    const contador = elemento.querySelector(".contadorCampo");
    const botaoAnexar = elemento.querySelector(".botaoAnexar");

    const gerenciador = criarGrade({
      elementoGrade,
      aceitaPdf: true,
      aoAtualizar: (quantidade) => {
        contador.textContent = quantidade === 0
          ? "vazio"
          : (quantidade === 1 ? "1 arquivo" : quantidade + " arquivos");
        contador.classList.toggle("contadorPreenchido", quantidade > 0);
      },
    });

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

      if (campo.id === "identificacao") {
        const total = gerenciador.quantidade() + novos.length;
        if (total > MAX_IDENTIFICACAO) {
          mostrarErro(
            "O campo " + campo.rotulo + " aceita no maximo " + MAX_IDENTIFICACAO +
            " arquivos. Voce tentou deixar " + total + "."
          );
          return;
        }
      }

      limparErro();
      gerenciador.adicionar(novos);

      if (campo.id === "nota_fiscal") {
        analisarNota(gerenciador.obterItens());
      }
    });

    placasCampos.appendChild(no);
    camposMontados.push({ id: campo.id, rotulo: campo.rotulo, gerenciador });

    // devolve os arquivos que ja estavam neste campo
    if (anexados[campo.id]) {
      gerenciador.adicionar(anexados[campo.id]);
    }
  }
}


let notaBloqueada = false;
let nomeExtraido = "";

async function analisarNota(itens) {
  notaBloqueada = false;
  const nota = itens.find((i) => !i.ehFoto);
  if (!nota) return;

  const dados = new FormData();
  dados.append("arquivo", nota.arquivo, nota.arquivo.name);
  try {
    const resposta = await fetch("/api/placas/analisar_nf", { method: "POST", body: dados });
    const json = await resposta.json();
    if (!resposta.ok) {
      notaBloqueada = Boolean(json.bloqueia);
      mostrarErro(json.erro || "Nao foi possivel ler a nota fiscal.");
      return;
    }
    const d = json.dados || {};
    nomeExtraido = d.cliente || "";
    if (nomeExtraido) {
      placasClienteLido.textContent = "Cliente: " + nomeExtraido;
      placasClienteLido.classList.remove("oculto");
    }
    if (d.tipo && d.tipo !== tipoAtual) {
      const botao = document.querySelector(`#placasFormulario .opcaoModo[data-tipo="${d.tipo}"]`);
      if (botao) botao.click();
    }
    limparErro();
  } catch (e) {
    mostrarErro("Nao foi possivel analisar a nota fiscal.");
  }
}

/* Adiciona o cliente atual a lista do lote */
function coletarCliente() {
  const documentos = camposMontados
    .map((c) => ({ id: c.id, rotulo: c.rotulo, arquivos: c.gerenciador.obterItens().map((i) => i.arquivo) }))
    .filter((d) => d.arquivos.length > 0);
  return {
    nome: nomeExtraido.trim(),
    tipo: tipoAtual,
    processo: processoAtual,
    documentos,
  };
}

function adicionarCliente(cliente) {
  clientes.push(cliente);
  renderizarLista();
  nomeExtraido = "";
  placasClienteLido.textContent = "";
  placasClienteLido.classList.add("oculto");
  notaBloqueada = false;
  montarCampos(false);
  limparErro();
}

placasAdicionar.addEventListener("click", () => {
  const cliente = coletarCliente();

  if (cliente.documentos.length === 0) {
    mostrarErro("Anexe ao menos um documento antes de adicionar o cliente.");
    return;
  }

  if (notaBloqueada) {
    mostrarErro("Valor da Placa nao encontrado na NF");
    return;
  }

  const temNota = cliente.documentos.some((d) => d.id === "nota_fiscal");
  const temRecibo = cliente.documentos.some((d) => d.id === "recibo");
  if (temNota && !temRecibo) {
    placasTextoConfirmacao.textContent =
      "Este cliente nao tem o recibo anexado. Deseja continuar?";
    acaoConfirmada = () => adicionarCliente(cliente);
    mostrarSecao(placasConfirmacao);
    return;
  }

  const identificacao = camposMontados.find((c) => c.id === "identificacao");
  const quantidadeId = identificacao ? identificacao.gerenciador.quantidade() : 0;
  if (quantidadeId >= AVISO_IDENTIFICACAO) {
    placasTextoConfirmacao.textContent =
      "Voce esta anexando " + quantidadeId + " arquivos no campo Documento. Deseja continuar?";
    acaoConfirmada = () => adicionarCliente(cliente);
    mostrarSecao(placasConfirmacao);
    return;
  }

  adicionarCliente(cliente);
});

placasConfirmarSim.addEventListener("click", () => {
  mostrarSecao(placasFormulario);
  if (acaoConfirmada) acaoConfirmada();
  acaoConfirmada = null;
});

placasConfirmarNao.addEventListener("click", () => {
  acaoConfirmada = null;
  mostrarSecao(placasFormulario);
});

function renderizarLista() {
  placasLista.innerHTML = "";
  clientes.forEach((cliente, indice) => {
    const linha = document.createElement("div");
    linha.className = "linhaCliente";

    const info = document.createElement("span");
    info.className = "nomeCliente";
    const rotuloTipo = cliente.tipo.toUpperCase();
    const rotuloProcesso = cliente.processo === "carta" ? "Carta de credito" : "Venda a vista";
    info.textContent = (cliente.nome || "CLIENTE" + (indice + 1)) +
      "  (" + rotuloTipo + ", " + rotuloProcesso + ")";

    const remover = document.createElement("button");
    remover.className = "botaoSecundario botaoRemoverCliente";
    remover.textContent = "Remover";
    remover.addEventListener("click", () => {
      clientes.splice(indice, 1);
      renderizarLista();
    });

    linha.appendChild(info);
    linha.appendChild(remover);
    placasLista.appendChild(linha);
  });

  placasListaArea.classList.toggle("oculto", clientes.length === 0);
}

/* Geracao do lote */
placasGerar.addEventListener("click", async () => {
  if (clientes.length === 0) {
    mostrarErro("Adicione ao menos um cliente.");
    return;
  }
  limparErro();
  mostrarSecao(placasProcessando);

  const dados = new FormData();
  const resumo = clientes.map((cliente) => ({
    nome: cliente.nome,
    tipo: cliente.tipo,
    processo: cliente.processo,
  }));
  dados.append("clientes", JSON.stringify(resumo));

  clientes.forEach((cliente, indice) => {
    for (const documento of cliente.documentos) {
      for (const arquivo of documento.arquivos) {
        dados.append("c" + indice + "_" + documento.id, arquivo, arquivo.name);
      }
    }
  });

  try {
    const resposta = await fetch("/api/placas/enviar", { method: "POST", body: dados });
    const json = await resposta.json();
    if (!resposta.ok) {
      mostrarSecao(placasFormulario);
      mostrarErro(json.erro || "Nao foi possivel gerar o arquivo.");
      return;
    }
    jobAtual = json.job_id;
    placasNomeArquivo.value = nomeZipPadrao();
    const plural = json.clientes === 1 ? "cliente" : "clientes";
    placasTamanho.textContent = json.clientes + " " + plural + ". Tamanho: " + json.tamanho_final;
    mostrarSecao(placasResultado);
  } catch (e) {
    mostrarSecao(placasFormulario);
    mostrarErro("Nao foi possivel enviar os arquivos. Verifique a conexao.");
  }
});

placasBaixar.addEventListener("click", () => {
  if (!jobAtual) return;
  let nome = (placasNomeArquivo.value || "").trim();
  if (nome === "") nome = nomeZipPadrao();
  window.location.href = "/api/placas/baixar/" + jobAtual + "?nome=" + encodeURIComponent(nome);
});

placasVoltar.addEventListener("click", async () => {
  if (jobAtual) {
    try { await fetch("/api/placas/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
    jobAtual = null;
  }
  mostrarSecao(placasFormulario);
});

function limparTudo() {
  jobAtual = null;
  clientes = [];
  notaBloqueada = false;
  renderizarLista();
  nomeExtraido = "";
  placasClienteLido.textContent = "";
  placasClienteLido.classList.add("oculto");
  montarCampos(false);
  limparErro();
  mostrarSecao(placasFormulario);
}

placasLimpar.addEventListener("click", limparTudo);

placasReiniciar.addEventListener("click", async () => {
  if (jobAtual) {
    try { await fetch("/api/placas/reiniciar/" + jobAtual, { method: "POST" }); } catch (e) {}
  }
  limparTudo();
});

montarCampos();
placasNomeArquivo.value = nomeZipPadrao();
