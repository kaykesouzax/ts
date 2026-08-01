/* Aba Placas */

import { criarGrade, tornarAreaClicavel } from "/static/js/grade.js";

/* Le a resposta com seguranca: se nao vier JSON (ex.: pagina de erro
   do servidor por upload grande demais), devolve um erro legivel em
   vez de travar. */
async function lerResposta(resposta) {
  const tipo = resposta.headers.get("content-type") || "";
  if (tipo.includes("application/json")) {
    return await resposta.json();
  }
  await resposta.text().catch(() => "");
  if (resposta.status === 413) {
    return { erro: "Os arquivos passam do limite de tamanho. Gere o lote em duas partes ou comprima as imagens antes." };
  }
  return { erro: "O servidor nao respondeu como esperado. Tente novamente." };
}

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
const placasBaixarLista = document.getElementById("placasBaixarLista");
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
let zipFinalBlob = null;
let acaoConfirmada = null;

function formatarTamanho(numBytes) {
  if (numBytes < 1024) return numBytes + " B";
  const kb = numBytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  const mb = kb / 1024;
  return mb.toFixed(2) + " MB";
}

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
    const json = await lerResposta(resposta);
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

/* Envia so os documentos deste cliente ao servidor (nota fiscal, recibo
   preenchido, conversao de fotos), baixa o resultado e devolve os
   arquivos prontos como blobs, sem embrulhar em zip. Isso acontece na
   hora de Adicionar cliente, para que o lote inteiro ja fique pronto
   no navegador e o Gerar arquivo final nao dependa mais do servidor. */
async function processarClienteNoServidor(cliente) {
  const dados = new FormData();
  dados.append("individual", "1");
  dados.append("clientes", JSON.stringify([
    { nome: cliente.nome, tipo: cliente.tipo, processo: cliente.processo },
  ]));
  for (const documento of cliente.documentos) {
    for (const arquivo of documento.arquivos) {
      dados.append("c0_" + documento.id, arquivo, arquivo.name);
    }
  }

  const resposta = await fetch("/api/placas/enviar", { method: "POST", body: dados });
  const json = await lerResposta(resposta);
  if (!resposta.ok) {
    throw new Error(json.erro || "Nao foi possivel processar este cliente.");
  }

  const jobId = json.job_id;
  const nomeParaBusca = (cliente.nome || "CLIENTE").trim();
  let blobZip;
  try {
    const respostaZip = await fetch(
      "/api/placas/baixar/" + jobId + "?nome=" + encodeURIComponent(nomeParaBusca)
    );
    if (!respostaZip.ok) {
      throw new Error("Nao foi possivel obter os arquivos processados.");
    }
    blobZip = await respostaZip.blob();
  } finally {
    fetch("/api/placas/reiniciar/" + jobId, { method: "POST" }).catch(() => {});
  }

  const zipLido = await JSZip.loadAsync(blobZip);
  let pastaNome = "";
  const arquivos = [];
  for (const caminhoInterno of Object.keys(zipLido.files)) {
    const entrada = zipLido.files[caminhoInterno];
    if (entrada.dir) continue;
    const partes = caminhoInterno.split("/");
    if (!pastaNome) pastaNome = partes[0];
    const nomeArquivo = partes.slice(1).join("/");
    const blobArquivo = await entrada.async("blob");
    arquivos.push({ nome: nomeArquivo, blob: blobArquivo });
  }

  return { pastaNome: pastaNome || "CLIENTE", arquivos };
}

/* Processa o cliente no servidor e so entao adiciona ele a lista.
   Se der erro, o formulario continua preenchido do jeito que estava
   para tentar de novo, sem perder nada. */
async function processarEAdicionar(cliente) {
  limparErro();
  const textoOriginal = placasAdicionar.textContent;
  placasAdicionar.disabled = true;
  placasAdicionar.textContent = "Processando...";
  try {
    const processado = await processarClienteNoServidor(cliente);
    cliente.pastaNome = processado.pastaNome;
    cliente.arquivosProcessados = processado.arquivos;
    cliente.documentos = [];
    adicionarCliente(cliente);
  } catch (e) {
    mostrarErro(e.message || "Nao foi possivel processar este cliente. Tente novamente.");
  } finally {
    placasAdicionar.disabled = false;
    placasAdicionar.textContent = textoOriginal;
  }
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
    acaoConfirmada = () => processarEAdicionar(cliente);
    mostrarSecao(placasConfirmacao);
    return;
  }

  const identificacao = camposMontados.find((c) => c.id === "identificacao");
  const quantidadeId = identificacao ? identificacao.gerenciador.quantidade() : 0;
  if (quantidadeId >= AVISO_IDENTIFICACAO) {
    placasTextoConfirmacao.textContent =
      "Voce esta anexando " + quantidadeId + " arquivos no campo Documento. Deseja continuar?";
    acaoConfirmada = () => processarEAdicionar(cliente);
    mostrarSecao(placasConfirmacao);
    return;
  }

  processarEAdicionar(cliente);
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

    const baixar = document.createElement("button");
    baixar.className = "botaoSecundario botaoBaixarCliente";
    baixar.textContent = "Baixar pasta";
    baixar.addEventListener("click", () => baixarPastaCliente(cliente, baixar));

    const remover = document.createElement("button");
    remover.className = "botaoSecundario botaoRemoverCliente";
    remover.textContent = "Remover";
    remover.addEventListener("click", () => {
      clientes.splice(indice, 1);
      renderizarLista();
    });

    const grupoBotoes = document.createElement("div");
    grupoBotoes.className = "botoesCliente";
    grupoBotoes.appendChild(baixar);
    grupoBotoes.appendChild(remover);

    linha.appendChild(info);
    linha.appendChild(grupoBotoes);
    placasLista.appendChild(linha);
  });

  placasListaArea.classList.toggle("oculto", clientes.length === 0);
}

/* Baixa os documentos ja processados de um unico cliente, direto da
   memoria do navegador, sem chamar o servidor. Cada arquivo sai
   separado (sem zip), dentro de uma subpasta com o nome do cliente
   dentro da pasta de downloads (funciona no Chrome). Serve como
   alternativa quando o Gerar arquivo falhar por causa do lote inteiro. */
function baixarPastaCliente(cliente, botao) {
  const arquivos = cliente.arquivosProcessados || [];
  if (arquivos.length === 0) {
    mostrarErro("Este cliente ainda nao tem arquivos processados.");
    return;
  }
  limparErro();
  const textoOriginal = botao.textContent;
  botao.disabled = true;

  arquivos.forEach((arquivo, posicao) => {
    setTimeout(() => {
      const url = URL.createObjectURL(arquivo.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = cliente.pastaNome + "/" + arquivo.nome;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (posicao === arquivos.length - 1) {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    }, posicao * 300);
  });
}

/* Copia texto para a area de transferencia. A Clipboard API so funciona
   em contexto seguro (https ou localhost); fora disso cai no metodo
   antigo com textarea, que funciona em http comum tambem. */
async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // segue para o metodo alternativo
    }
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.left = "-1000px";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let copiado = false;
  try {
    copiado = document.execCommand("copy");
  } catch (e) {
    copiado = false;
  }
  document.body.removeChild(area);
  return copiado;
}

function saudacaoAtual() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia!";
  if (hora < 18) return "Boa tarde!";
  return "Boa noite!";
}

/* Copia a lista de nomes do lote para a area de transferencia */
placasBaixarLista.addEventListener("click", async () => {
  if (clientes.length === 0) return;
  const nomes = clientes.map((cliente, indice) => (cliente.nome || "CLIENTE" + (indice + 1)).toUpperCase());
  const artigo = clientes.length === 1 ? "do" : "dos";
  const substantivo = clientes.length === 1 ? "cliente" : "clientes";
  const linhas = [
    saudacaoAtual(),
    "Segue o processo para emplacamento " + artigo + " " + substantivo + ":",
    ...nomes,
  ];
  const texto = linhas.join("\n");
  const sucesso = await copiarTexto(texto);
  if (sucesso) {
    limparErro();
    const textoOriginal = placasBaixarLista.textContent;
    placasBaixarLista.textContent = "Copiado";
    placasBaixarLista.disabled = true;
    setTimeout(() => {
      placasBaixarLista.textContent = textoOriginal;
      placasBaixarLista.disabled = false;
    }, 1500);
  } else {
    mostrarErro("Nao foi possivel copiar a lista. Copie manualmente.");
  }
});

/* Geracao do lote: monta o zip inteiro no navegador a partir dos
   arquivos que cada cliente ja deixou prontos ao ser adicionado.
   Nao depende mais do servidor nesta etapa. */
placasGerar.addEventListener("click", async () => {
  if (clientes.length === 0) {
    mostrarErro("Adicione ao menos um cliente.");
    return;
  }
  limparErro();
  mostrarSecao(placasProcessando);

  try {
    const zip = new JSZip();
    const nomesUsados = new Set();
    for (const cliente of clientes) {
      let nomePasta = cliente.pastaNome || "CLIENTE";
      let base = nomePasta;
      let contador = 2;
      while (nomesUsados.has(nomePasta.toLowerCase())) {
        nomePasta = base + " (" + contador + ")";
        contador += 1;
      }
      nomesUsados.add(nomePasta.toLowerCase());

      for (const arquivo of cliente.arquivosProcessados || []) {
        zip.file(nomePasta + "/" + arquivo.nome, arquivo.blob);
      }
    }

    zipFinalBlob = await zip.generateAsync({ type: "blob" });
    placasNomeArquivo.value = nomeZipPadrao();
    const plural = clientes.length === 1 ? "cliente" : "clientes";
    placasTamanho.textContent = clientes.length + " " + plural + ". Tamanho: " + formatarTamanho(zipFinalBlob.size);
    mostrarSecao(placasResultado);
  } catch (e) {
    mostrarSecao(placasFormulario);
    mostrarErro("Nao foi possivel montar o arquivo final.");
  }
});

placasBaixar.addEventListener("click", () => {
  if (!zipFinalBlob) return;
  let nome = (placasNomeArquivo.value || "").trim();
  if (nome === "") nome = nomeZipPadrao();
  if (!nome.toLowerCase().endsWith(".zip")) nome = nome + ".zip";

  const url = URL.createObjectURL(zipFinalBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

placasVoltar.addEventListener("click", () => {
  zipFinalBlob = null;
  mostrarSecao(placasFormulario);
});

function limparTudo() {
  zipFinalBlob = null;
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

placasReiniciar.addEventListener("click", limparTudo);

montarCampos();
placasNomeArquivo.value = nomeZipPadrao();
