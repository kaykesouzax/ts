"""
Modulo de compressao de PDF.
Estrategia em cascata:
  1. Basica: limpeza e recompressao sem perda (garbage collection, deflate).
  2. Robusta: recompressao das imagens internas (JPEG, qualidade reduzida),
     mantendo o texto vetorial intacto e selecionavel.
  3. Rasterizada: cada pagina vira uma imagem (ultimo recurso), com piso de
     resolucao para nao comprometer a legibilidade.
"""

import io
import os
import shutil
import fitz
import img2pdf
from PIL import Image

ALVO_PADRAO = 500 * 1024  # 500kb

QUALIDADES_ROBUSTA = [70, 55, 40, 28]
DPI_RASTER = [130, 100]
QUALIDADE_RASTER = 55


def tamanho(caminho):
    return os.path.getsize(caminho)


def compressao_basica(entrada, saida):
    doc = fitz.open(entrada)
    doc.save(saida, garbage=4, deflate=True, clean=True)
    doc.close()


def compressao_robusta(entrada, saida, qualidade):
    doc = fitz.open(entrada)
    for pagina in doc:
        for img in pagina.get_images(full=True):
            xref = img[0]
            try:
                base = doc.extract_image(xref)
                dados_imagem = base["image"]
                imagem_pil = Image.open(io.BytesIO(dados_imagem))
                if imagem_pil.mode in ("RGBA", "P", "CMYK", "LA"):
                    imagem_pil = imagem_pil.convert("RGB")
                buffer = io.BytesIO()
                imagem_pil.save(buffer, format="JPEG", quality=qualidade, optimize=True)
                novos_dados = buffer.getvalue()
                if len(novos_dados) < len(dados_imagem):
                    doc.update_stream(xref, novos_dados, compress=0)
                    doc.xref_set_key(xref, "Filter", "/DCTDecode")
                    doc.xref_set_key(xref, "ColorSpace", "/DeviceRGB")
                    doc.xref_set_key(xref, "BitsPerComponent", "8")
                    doc.xref_set_key(xref, "DecodeParms", "null")
                    doc.xref_set_key(xref, "SMask", "null")
            except Exception:
                continue
    doc.save(saida, garbage=4, deflate=True, clean=True)
    doc.close()


def compressao_rasterizada(entrada, saida, dpi, qualidade):
    doc = fitz.open(entrada)
    paginas_jpeg = []
    for pagina in doc:
        pix = pagina.get_pixmap(dpi=dpi)
        paginas_jpeg.append(pix.tobytes("jpg", jpg_quality=qualidade))
    doc.close()
    with open(saida, "wb") as f:
        f.write(img2pdf.convert(paginas_jpeg))


def arquivo_valido(caminho):
    """Confirma que o PDF gerado abre e todas as paginas renderizam."""
    try:
        doc = fitz.open(caminho)
        if doc.page_count == 0:
            return False
        for pagina in doc:
            pagina.get_pixmap(dpi=40)
        doc.close()
        return True
    except Exception:
        return False


QUALIDADE_BASICA = 72


def comprimir_basico(entrada, pasta_saida):
    """
    Compressao mediana, sem meta de tamanho.
    Faz a limpeza sem perda e recomprime as imagens internas numa
    qualidade confortavel. Nunca rasteriza, entao o texto continua
    selecionavel e a legibilidade fica preservada com folga.
    """
    candidato_limpo = os.path.join(pasta_saida, "limpo.pdf")
    compressao_basica(entrada, candidato_limpo)

    melhor_caminho = candidato_limpo
    melhor_tamanho = tamanho(candidato_limpo)
    metodo = "limpeza"

    candidato = os.path.join(pasta_saida, "mediana.pdf")
    try:
        compressao_robusta(entrada, candidato, QUALIDADE_BASICA)
        if arquivo_valido(candidato):
            t = tamanho(candidato)
            if t < melhor_tamanho:
                melhor_caminho, melhor_tamanho, metodo = candidato, t, "mediana"
    except Exception:
        pass

    # nunca devolve algo maior que o arquivo enviado
    original = tamanho(entrada)
    if melhor_tamanho >= original:
        sem_ganho = os.path.join(pasta_saida, "original.pdf")
        shutil.copyfile(entrada, sem_ganho)
        return {"caminho": sem_ganho, "tamanho_final": original,
                "metodo": "sem ganho", "alerta": False, "meta_atingida": True}

    return {"caminho": melhor_caminho, "tamanho_final": melhor_tamanho,
            "metodo": metodo, "alerta": False, "meta_atingida": True}


def comprimir(entrada, pasta_saida, alvo=ALVO_PADRAO):
    """
    Executa a cascata de compressao.
    Retorna dict com: caminho, tamanho_final, metodo, alerta
    """
    candidato_basico = os.path.join(pasta_saida, "basica.pdf")
    compressao_basica(entrada, candidato_basico)

    melhor_caminho = candidato_basico
    melhor_tamanho = tamanho(candidato_basico)
    metodo = "basica"

    if melhor_tamanho <= alvo:
        return {"caminho": melhor_caminho, "tamanho_final": melhor_tamanho,
                "metodo": metodo, "alerta": False, "meta_atingida": True}

    for i, qualidade in enumerate(QUALIDADES_ROBUSTA):
        candidato = os.path.join(pasta_saida, f"robusta_{i}.pdf")
        compressao_robusta(entrada, candidato, qualidade)
        if not arquivo_valido(candidato):
            continue
        t = tamanho(candidato)
        if t < melhor_tamanho:
            melhor_caminho, melhor_tamanho, metodo = candidato, t, "robusta"
        if t <= alvo:
            return {"caminho": candidato, "tamanho_final": t,
                    "metodo": "robusta", "alerta": False, "meta_atingida": True}

    for i, dpi in enumerate(DPI_RASTER):
        candidato = os.path.join(pasta_saida, f"rasterizada_{i}.pdf")
        compressao_rasterizada(entrada, candidato, dpi, QUALIDADE_RASTER)
        if not arquivo_valido(candidato):
            continue
        t = tamanho(candidato)
        if t < melhor_tamanho:
            melhor_caminho, melhor_tamanho, metodo = candidato, t, "rasterizada"
        if t <= alvo:
            return {"caminho": candidato, "tamanho_final": t,
                    "metodo": "rasterizada", "alerta": True, "meta_atingida": True}

    # nao foi possivel atingir a meta, devolve o melhor resultado obtido
    return {"caminho": melhor_caminho, "tamanho_final": melhor_tamanho,
            "metodo": metodo, "alerta": (metodo == "rasterizada"),
            "meta_atingida": False}
