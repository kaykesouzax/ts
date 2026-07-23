/*
  Modulo compartilhado: grade de cartoes e visualizador.
  Usado pelas abas Juntar Arquivos e Converter Foto para PDF.
*/

import * as pdfjsLib from "/static/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/pdfjs/pdf.worker.min.mjs";

export const EXT_FOTO = ["jpg", "jpeg", "png", "bmp", "gif", "tif", "tiff", "webp"];

export function extde(nome) {
  const p = nome.split(".");
  return p.length > 1 ? p[p.length - 1].toLowerCase() : "";
}

export function ehFotoNome(nome) {
  return EXT_FOTO.includes(extde(nome));
}

/* Conta as paginas de um arquivo: foto vale 1, PDF vale o total de paginas. */
export async function contarPaginas(arquivo, ehFoto) {
  if (ehFoto) return 1;
  try {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const total = pdf.numPages;
    pdf.destroy();
    return total;
  } catch (e) {
    return 0;
  }
}

const LUPA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>';
const LIXO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

/*
  Torna a area vazia clicavel: clicar em qualquer ponto que nao seja
  um cartao ou um botao aciona a escolha de arquivos.
*/
export function tornarAreaClicavel(area, aoClicar) {
  if (!area) return;
  area.classList.add("areaClicavel");
  area.addEventListener("click", (e) => {
    if (e.target.closest(".cartao")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("input")) return;
    aoClicar();
  });
}

/* ============================ VISUALIZADOR ============================ */

const visualizador = document.getElementById("visualizador");
const vizConteudo = document.getElementById("vizConteudo");
const vizPagina = document.getElementById("vizPagina");
const vizAnterior = document.getElementById("vizAnterior");
const vizProxima = document.getElementById("vizProxima");
const vizMais = document.getElementById("vizMais");
const vizMenos = document.getElementById("vizMenos");
const vizGirar = document.getElementById("vizGirar");
const vizFechar = document.getElementById("vizFechar");

let vizPaginas = [];
let vizIndice = 0;
let vizEscala = 1;
let vizRotacao = 0;
let vizPdf = null;
let vizFoto = null;

export async function abrirVisualizador(item) {
  vizIndice = 0;
  vizEscala = 1;
  vizRotacao = 0;
  vizPdf = null;
  vizFoto = null;
  vizPaginas = [];

  if (item.ehFoto) {
    vizFoto = URL.createObjectURL(item.arquivo);
    vizPaginas = [1];
  } else {
    const buffer = await item.arquivo.arrayBuffer();
    vizPdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    vizPaginas = Array.from({ length: vizPdf.numPages }, (_, i) => i + 1);
  }

  visualizador.classList.remove("oculto");
  await desenharPaginaViz();
  vizConteudo.scrollTop = 0;
}

async function desenharPaginaViz() {
  vizConteudo.innerHTML = "";
  vizPagina.textContent = `${vizIndice + 1} / ${vizPaginas.length}`;

  if (vizFoto) {
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = vizFoto;
    });
    const canvas = document.createElement("canvas");
    const areaLargura = vizConteudo.clientWidth - 32;
    const proporcaoInicial = Math.min(1, areaLargura / img.naturalWidth);
    const escalaFinal = proporcaoInicial * vizEscala;

    const rad = (vizRotacao % 360) * Math.PI / 180;
    const girado = vizRotacao % 180 !== 0;
    const w = img.naturalWidth * escalaFinal;
    const h = img.naturalHeight * escalaFinal;
    canvas.width = girado ? h : w;
    canvas.height = girado ? w : h;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    vizConteudo.appendChild(canvas);
    return;
  }

  const pagina = await vizPdf.getPage(vizPaginas[vizIndice]);
  const areaLargura = vizConteudo.clientWidth - 32;
  const viewportBase = pagina.getViewport({ scale: 1, rotation: vizRotacao });
  const escala = (areaLargura / viewportBase.width) * vizEscala;
  const viewport = pagina.getViewport({ scale: escala, rotation: vizRotacao });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  vizConteudo.appendChild(canvas);
}

async function trocarPagina(delta) {
  const novo = vizIndice + delta;
  if (novo < 0 || novo >= vizPaginas.length) return false;
  vizIndice = novo;
  await desenharPaginaViz();
  vizConteudo.scrollTop = delta > 0 ? 0 : vizConteudo.scrollHeight;
  return true;
}

function fecharVisualizador() {
  visualizador.classList.add("oculto");
  vizConteudo.innerHTML = "";
  if (vizPdf) { vizPdf.destroy(); vizPdf = null; }
  if (vizFoto) { URL.revokeObjectURL(vizFoto); vizFoto = null; }
}

if (visualizador) {
  vizAnterior.addEventListener("click", () => trocarPagina(-1));
  vizProxima.addEventListener("click", () => trocarPagina(1));
  vizMais.addEventListener("click", async () => {
    vizEscala = Math.min(vizEscala + 0.25, 5);
    await desenharPaginaViz();
  });
  vizMenos.addEventListener("click", async () => {
    vizEscala = Math.max(vizEscala - 0.25, 0.5);
    await desenharPaginaViz();
  });
  vizGirar.addEventListener("click", async () => {
    vizRotacao = (vizRotacao + 90) % 360;
    await desenharPaginaViz();
  });
  vizFechar.addEventListener("click", fecharVisualizador);

  // fecha ao clicar fora (no fundo escuro), sem fechar ao clicar na barra
  // ou no proprio documento em exibicao
  visualizador.addEventListener("click", (e) => {
    if (e.target === visualizador) fecharVisualizador();
  });

  document.addEventListener("keydown", (e) => {
    if (visualizador.classList.contains("oculto")) return;
    if (e.key === "Escape") fecharVisualizador();
    else if (e.key === "ArrowRight") trocarPagina(1);
    else if (e.key === "ArrowLeft") trocarPagina(-1);
  });

  let trocandoPagina = false;
  vizConteudo.addEventListener("wheel", async (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) vizEscala = Math.min(vizEscala + 0.15, 5);
      else vizEscala = Math.max(vizEscala - 0.15, 0.5);
      await desenharPaginaViz();
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      vizConteudo.scrollLeft += e.deltaY;
      return;
    }
    const topo = vizConteudo.scrollTop;
    const maxScroll = vizConteudo.scrollHeight - vizConteudo.clientHeight;
    const margem = 2;
    const noFim = topo >= maxScroll - margem;
    const noInicio = topo <= margem;

    if (e.deltaY > 0 && noFim && !trocandoPagina && vizIndice < vizPaginas.length - 1) {
      e.preventDefault();
      trocandoPagina = true;
      await trocarPagina(1);
      setTimeout(() => { trocandoPagina = false; }, 120);
    } else if (e.deltaY < 0 && noInicio && !trocandoPagina && vizIndice > 0) {
      e.preventDefault();
      trocandoPagina = true;
      await trocarPagina(-1);
      setTimeout(() => { trocandoPagina = false; }, 120);
    }
  }, { passive: false });
}

/* ============================== GRADE ============================== */

/*
  criarGrade({ elementoGrade, aceitaPdf, aoAtualizar })
  Retorna um gerenciador com:
    adicionar(arquivos) -> quantos foram aceitos
    obterItens()        -> lista na ordem atual
    limpar()
    quantidade()
*/
export function criarGrade({ elementoGrade, aceitaPdf = true, aoAtualizar = null }) {
  let itens = [];
  let contador = 0;
  let idArrastando = null;

  function notificar() {
    if (aoAtualizar) aoAtualizar(itens.length);
  }

  function adicionar(arquivos) {
    let aceitos = 0;
    for (const arquivo of arquivos) {
      const ext = extde(arquivo.name);
      const ehFoto = EXT_FOTO.includes(ext);
      const ehPdf = ext === "pdf";
      if (!ehFoto && !(aceitaPdf && ehPdf)) continue;
      itens.push({ id: ++contador, arquivo, ehFoto });
      aceitos++;
    }
    if (aceitos > 0) renderizar();
    return aceitos;
  }

  function remover(id) {
    itens = itens.filter((x) => x.id !== id);
    renderizar();
  }

  function reordenar(idOrigem, idAlvo) {
    const iOrigem = itens.findIndex((x) => String(x.id) === String(idOrigem));
    const iAlvo = itens.findIndex((x) => String(x.id) === String(idAlvo));
    if (iOrigem < 0 || iAlvo < 0) return;
    const [movido] = itens.splice(iOrigem, 1);
    itens.splice(iAlvo, 0, movido);
    renderizar();
  }

  function ligarArraste(cartao) {
    cartao.addEventListener("dragstart", () => {
      idArrastando = cartao.dataset.id;
      cartao.classList.add("arrastando");
    });
    cartao.addEventListener("dragend", () => {
      idArrastando = null;
      cartao.classList.remove("arrastando");
      elementoGrade.querySelectorAll(".cartao").forEach((c) => c.classList.remove("alvoArraste"));
    });
    cartao.addEventListener("dragover", (e) => {
      e.preventDefault();
      cartao.classList.add("alvoArraste");
    });
    cartao.addEventListener("dragleave", () => cartao.classList.remove("alvoArraste"));
    cartao.addEventListener("drop", (e) => {
      e.preventDefault();
      cartao.classList.remove("alvoArraste");
      const idAlvo = cartao.dataset.id;
      if (idArrastando === null || idArrastando === idAlvo) return;
      reordenar(idArrastando, idAlvo);
    });
  }

  async function gerarMiniatura(item, alvo) {
    try {
      if (item.ehFoto) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(item.arquivo);
        alvo.appendChild(img);
      } else {
        const buffer = await item.arquivo.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pagina = await pdf.getPage(1);
        const viewport = pagina.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        alvo.appendChild(canvas);
        pdf.destroy();
      }
    } catch (e) {
      alvo.textContent = "";
    }
  }

  function criarCartao(item) {
    const cartao = document.createElement("div");
    cartao.className = "cartao";
    cartao.draggable = true;
    cartao.dataset.id = String(item.id);

    const topo = document.createElement("div");
    topo.className = "cartaoTopo";

    const btLupa = document.createElement("button");
    btLupa.className = "cartaoAcao";
    btLupa.innerHTML = LUPA_SVG;
    btLupa.title = "Visualizar";
    btLupa.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirVisualizador(item);
    });

    const btLixo = document.createElement("button");
    btLixo.className = "cartaoAcao";
    btLixo.innerHTML = LIXO_SVG;
    btLixo.title = "Remover";
    btLixo.addEventListener("click", (e) => {
      e.stopPropagation();
      remover(item.id);
    });

    topo.appendChild(btLupa);
    topo.appendChild(btLixo);

    const mini = document.createElement("div");
    mini.className = "cartaoMiniatura";

    const nome = document.createElement("div");
    nome.className = "cartaoNome";
    nome.textContent = item.arquivo.name;

    cartao.appendChild(topo);
    cartao.appendChild(mini);
    cartao.appendChild(nome);

    ligarArraste(cartao);
    return cartao;
  }

  function renderizar() {
    elementoGrade.innerHTML = "";
    for (const item of itens) {
      const cartao = criarCartao(item);
      elementoGrade.appendChild(cartao);
      gerarMiniatura(item, cartao.querySelector(".cartaoMiniatura"));
    }
    notificar();
  }

  function limpar() {
    itens = [];
    elementoGrade.innerHTML = "";
    notificar();
  }

  return {
    adicionar,
    limpar,
    renderizar,
    obterItens: () => itens.slice(),
    quantidade: () => itens.length,
  };
}
