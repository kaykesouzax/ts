"""
Modulo de conversao de PDF para foto.
Cada pagina do PDF vira um arquivo JPG.
  - Uma pagina: gera um unico JPG.
  - Varias paginas: gera um JPG por pagina.
Resolucao padrao adequada para documentos (nitido sem ficar pesado).
"""

import os
import fitz

DPI_PADRAO = 150
QUALIDADE_JPEG = 80


def converter(entrada, pasta_saida, dpi=DPI_PADRAO):
    """
    Converte cada pagina do PDF em um JPG dentro de pasta_saida.
    Retorna a lista de caminhos das imagens geradas, na ordem das paginas.
    """
    doc = fitz.open(entrada)
    if doc.page_count == 0:
        doc.close()
        raise ValueError("PDF sem paginas.")

    total = doc.page_count
    largura_num = len(str(total))  # zeros a esquerda conforme a quantidade
    caminhos = []

    for indice, pagina in enumerate(doc):
        numero = str(indice + 1).zfill(max(2, largura_num))
        pix = pagina.get_pixmap(dpi=dpi)
        nome = f"pagina_{numero}.jpg"
        caminho = os.path.join(pasta_saida, nome)
        pix.save(caminho, jpg_quality=QUALIDADE_JPEG)
        caminhos.append(caminho)

    doc.close()
    return caminhos
