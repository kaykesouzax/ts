"""
Modulo de juncao de arquivos.
Recebe uma lista ordenada de caminhos (PDF ou foto) e gera um unico PDF.
  - PDF entra com todas as suas paginas, na ordem.
  - Foto entra como uma pagina, sem empilhar.
"""

import io
import os
import fitz
from PIL import Image

EXTENSOES_FOTO = (".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp")
EXTENSOES_PDF = (".pdf",)


def eh_foto(caminho):
    return caminho.lower().endswith(EXTENSOES_FOTO)


def eh_pdf(caminho):
    return caminho.lower().endswith(EXTENSOES_PDF)


def foto_para_pagina(doc_destino, caminho_foto):
    """Insere uma foto como uma nova pagina no documento, ajustada ao tamanho A4."""
    imagem = Image.open(caminho_foto)
    if imagem.mode in ("RGBA", "P", "LA"):
        fundo = Image.new("RGB", imagem.size, (255, 255, 255))
        if imagem.mode == "P":
            imagem = imagem.convert("RGBA")
        fundo.paste(imagem, mask=imagem.split()[-1] if imagem.mode in ("RGBA", "LA") else None)
        imagem = fundo
    elif imagem.mode != "RGB":
        imagem = imagem.convert("RGB")

    buffer = io.BytesIO()
    imagem.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)

    # pagina A4 em pontos (72 dpi): 595 x 842
    largura_pagina, altura_pagina = 595, 842
    margem = 20
    area_largura = largura_pagina - 2 * margem
    area_altura = altura_pagina - 2 * margem

    proporcao = min(area_largura / imagem.width, area_altura / imagem.height)
    nova_largura = imagem.width * proporcao
    nova_altura = imagem.height * proporcao

    x0 = (largura_pagina - nova_largura) / 2
    y0 = (altura_pagina - nova_altura) / 2
    retangulo = fitz.Rect(x0, y0, x0 + nova_largura, y0 + nova_altura)

    pagina = doc_destino.new_page(width=largura_pagina, height=altura_pagina)
    pagina.insert_image(retangulo, stream=buffer.read())


def juntar(caminhos_ordenados, caminho_saida):
    """
    Junta os arquivos na ordem recebida em um unico PDF.
    Retorna o numero total de paginas geradas.
    """
    destino = fitz.open()
    for caminho in caminhos_ordenados:
        if eh_pdf(caminho):
            origem = fitz.open(caminho)
            destino.insert_pdf(origem)
            origem.close()
        elif eh_foto(caminho):
            foto_para_pagina(destino, caminho)
        else:
            # extensao nao suportada: ignora com seguranca
            continue

    if destino.page_count == 0:
        destino.close()
        raise ValueError("Nenhuma pagina valida para juntar.")

    destino.save(caminho_saida, garbage=4, deflate=True)
    total = destino.page_count
    destino.close()
    return total
