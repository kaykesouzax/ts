"""
Compressao de imagens.

Dois modos:
  simples  - mantem a resolucao original e apenas recomprime.
  avancada - reduz a resolucao antes de recomprimir, com um piso
             de tamanho e de qualidade para o documento continuar
             legivel.

A saida e sempre JPEG, que e o formato que melhor comprime foto de
documento. Fotos com transparencia recebem fundo branco.
"""

import io
import shutil
import os
from PIL import Image, ImageOps

EXTENSOES = (".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp")

QUALIDADE_SIMPLES = 80

# no modo avancado o maior lado da imagem cai para este limite,
# mas nunca abaixo do piso, para o texto continuar legivel
LADO_MAIOR_ALVO = 2000
LADO_MAIOR_PISO = 1600
QUALIDADE_AVANCADA = 72


def eh_imagem(nome):
    return nome.lower().endswith(EXTENSOES)


def _abrir_normalizada(caminho):
    imagem = Image.open(caminho)
    try:
        imagem = ImageOps.exif_transpose(imagem)
    except Exception:
        pass

    if imagem.mode in ("RGBA", "LA", "P"):
        if imagem.mode == "P":
            imagem = imagem.convert("RGBA")
        fundo = Image.new("RGB", imagem.size, (255, 255, 255))
        canal = imagem.split()[-1] if imagem.mode in ("RGBA", "LA") else None
        fundo.paste(imagem, mask=canal)
        return fundo
    if imagem.mode != "RGB":
        return imagem.convert("RGB")
    return imagem


def _salvar(imagem, caminho, qualidade):
    imagem.save(caminho, format="JPEG", quality=qualidade, optimize=True, progressive=True)


def _valida(caminho):
    try:
        with Image.open(caminho) as conferencia:
            conferencia.verify()
        return True
    except Exception:
        return False


def comprimir(entrada, pasta_saida, modo="simples"):
    """
    Comprime a imagem e devolve:
      caminho, tamanho_final, largura, altura, reduzida
    """
    original = os.path.getsize(entrada)
    imagem = _abrir_normalizada(entrada)
    largura_inicial, altura_inicial = imagem.size
    reduzida = False

    if modo == "avancada":
        maior = max(imagem.size)
        alvo = max(LADO_MAIOR_ALVO, LADO_MAIOR_PISO)
        if maior > alvo:
            proporcao = alvo / maior
            novo = (max(1, round(imagem.width * proporcao)),
                    max(1, round(imagem.height * proporcao)))
            imagem = imagem.resize(novo, Image.LANCZOS)
            reduzida = True
        qualidade = QUALIDADE_AVANCADA
    else:
        qualidade = QUALIDADE_SIMPLES

    saida = os.path.join(pasta_saida, "imagem.jpg")
    _salvar(imagem, saida, qualidade)

    if not _valida(saida):
        raise ValueError("Nao foi possivel gerar a imagem comprimida.")

    # imagem que ja e leve (PNG de tela, por exemplo) pode crescer ao
    # virar JPEG. Nesse caso tenta qualidades menores e, se ainda assim
    # nao houver ganho, devolve o arquivo enviado sem alteracao.
    if os.path.getsize(saida) >= original:
        melhor = os.path.getsize(saida)
        for tentativa in (65, 55, 45):
            candidato = os.path.join(pasta_saida, f"tentativa_{tentativa}.jpg")
            _salvar(imagem, candidato, tentativa)
            if _valida(candidato) and os.path.getsize(candidato) < melhor:
                melhor = os.path.getsize(candidato)
                os.replace(candidato, saida)
            elif os.path.exists(candidato):
                os.remove(candidato)

        if melhor >= original:
            extensao = os.path.splitext(entrada)[1].lower() or ".jpg"
            copia = os.path.join(pasta_saida, "imagem" + extensao)
            if os.path.abspath(copia) != os.path.abspath(entrada):
                shutil.copyfile(entrada, copia)
            if os.path.exists(saida) and os.path.abspath(saida) != os.path.abspath(copia):
                os.remove(saida)
            return {
                "caminho": copia,
                "tamanho_final": original,
                "largura": largura_inicial,
                "altura": altura_inicial,
                "largura_inicial": largura_inicial,
                "altura_inicial": altura_inicial,
                "reduzida": False,
                "sem_ganho": True,
            }

    return {
        "caminho": saida,
        "tamanho_final": os.path.getsize(saida),
        "largura": imagem.width,
        "altura": imagem.height,
        "largura_inicial": largura_inicial,
        "altura_inicial": altura_inicial,
        "reduzida": reduzida,
        "sem_ganho": False,
    }
