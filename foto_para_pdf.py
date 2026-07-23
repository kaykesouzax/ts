"""
Modulo de conversao de foto para PDF.

Dois modos:
  1. "fotos" (padrao): cada foto vira uma pagina inteira.
  2. "documentos": ate 3 fotos empilhadas em uma unica pagina,
     com borda sobrando na folha. Mais de 3 nao e permitido.
"""

import io
import os
import fitz
from PIL import Image

MAX_DOCUMENTOS = 3

# pagina A4 em pontos (72 dpi)
LARGURA_PAGINA = 595
ALTURA_PAGINA = 842
MARGEM = 28
ESPACO_ENTRE = 18


def _abrir_normalizada(caminho):
    """Abre a imagem em RGB, respeitando a orientacao registrada pela camera."""
    imagem = Image.open(caminho)
    try:
        from PIL import ImageOps
        imagem = ImageOps.exif_transpose(imagem)
    except Exception:
        pass

    if imagem.mode in ("RGBA", "LA", "P"):
        if imagem.mode == "P":
            imagem = imagem.convert("RGBA")
        fundo = Image.new("RGB", imagem.size, (255, 255, 255))
        canal = imagem.split()[-1] if imagem.mode in ("RGBA", "LA") else None
        fundo.paste(imagem, mask=canal)
        imagem = fundo
    elif imagem.mode != "RGB":
        imagem = imagem.convert("RGB")
    return imagem


def _bytes_jpeg(imagem, qualidade=90):
    buffer = io.BytesIO()
    imagem.save(buffer, format="JPEG", quality=qualidade)
    buffer.seek(0)
    return buffer.read()


def _inserir_ajustado(pagina, imagem, area):
    """Insere a imagem centralizada dentro da area, mantendo a proporcao."""
    proporcao = min(area.width / imagem.width, area.height / imagem.height)
    largura = imagem.width * proporcao
    altura = imagem.height * proporcao
    x0 = area.x0 + (area.width - largura) / 2
    y0 = area.y0 + (area.height - altura) / 2
    destino = fitz.Rect(x0, y0, x0 + largura, y0 + altura)
    pagina.insert_image(destino, stream=_bytes_jpeg(imagem))


def converter_uma_por_pagina(caminhos, caminho_saida):
    """Modo Juncao de Fotos: cada foto ocupa uma pagina."""
    doc = fitz.open()
    area_largura = LARGURA_PAGINA - 2 * MARGEM
    area_altura = ALTURA_PAGINA - 2 * MARGEM

    for caminho in caminhos:
        imagem = _abrir_normalizada(caminho)
        pagina = doc.new_page(width=LARGURA_PAGINA, height=ALTURA_PAGINA)
        area = fitz.Rect(MARGEM, MARGEM, MARGEM + area_largura, MARGEM + area_altura)
        _inserir_ajustado(pagina, imagem, area)

    if doc.page_count == 0:
        doc.close()
        raise ValueError("Nenhuma foto valida.")

    doc.save(caminho_saida, garbage=4, deflate=True)
    total = doc.page_count
    doc.close()
    return total


def converter_empilhado(caminhos, caminho_saida):
    """
    Modo Juncao de Documentos: ate 3 fotos empilhadas em uma unica pagina,
    deixando borda na folha.
    """
    if len(caminhos) > MAX_DOCUMENTOS:
        raise ValueError("Maximo de 3 fotos por pagina neste modo.")
    if not caminhos:
        raise ValueError("Nenhuma foto enviada.")

    doc = fitz.open()
    pagina = doc.new_page(width=LARGURA_PAGINA, height=ALTURA_PAGINA)

    quantidade = len(caminhos)
    area_largura = LARGURA_PAGINA - 2 * MARGEM
    altura_total = ALTURA_PAGINA - 2 * MARGEM - ESPACO_ENTRE * (quantidade - 1)
    altura_faixa = altura_total / quantidade

    for indice, caminho in enumerate(caminhos):
        imagem = _abrir_normalizada(caminho)
        topo = MARGEM + indice * (altura_faixa + ESPACO_ENTRE)
        area = fitz.Rect(MARGEM, topo, MARGEM + area_largura, topo + altura_faixa)
        _inserir_ajustado(pagina, imagem, area)

    doc.save(caminho_saida, garbage=4, deflate=True)
    doc.close()
    return 1


MAX_DOCUMENTO_IDENTIFICACAO = 4


def converter_documento(caminhos, caminho_saida):
    """
    Layout do documento de identificacao: ate 4 fotos em uma unica pagina.
      1 a 3 fotos: empilhadas em linhas.
      4 fotos: duas linhas com duas fotos em cada.
    """
    if not caminhos:
        raise ValueError("Nenhuma foto enviada.")
    if len(caminhos) > MAX_DOCUMENTO_IDENTIFICACAO:
        raise ValueError("Maximo de 4 arquivos neste campo.")

    if len(caminhos) < 4:
        return converter_empilhado(caminhos, caminho_saida)

    doc = fitz.open()
    pagina = doc.new_page(width=LARGURA_PAGINA, height=ALTURA_PAGINA)

    area_largura = LARGURA_PAGINA - 2 * MARGEM
    area_altura = ALTURA_PAGINA - 2 * MARGEM
    largura_celula = (area_largura - ESPACO_ENTRE) / 2
    altura_celula = (area_altura - ESPACO_ENTRE) / 2

    for indice, caminho in enumerate(caminhos):
        linha = indice // 2
        coluna = indice % 2
        x0 = MARGEM + coluna * (largura_celula + ESPACO_ENTRE)
        y0 = MARGEM + linha * (altura_celula + ESPACO_ENTRE)
        area = fitz.Rect(x0, y0, x0 + largura_celula, y0 + altura_celula)
        _inserir_ajustado(pagina, _abrir_normalizada(caminho), area)

    doc.save(caminho_saida, garbage=4, deflate=True)
    doc.close()
    return 1


def converter(caminhos, caminho_saida, modo="fotos"):
    """Executa a conversao conforme o modo escolhido."""
    if modo == "documentos":
        return converter_empilhado(caminhos, caminho_saida)
    return converter_uma_por_pagina(caminhos, caminho_saida)
