"""
Modulo de solicitacao de placas.

Monta um ZIP com uma pasta por cliente. Dentro de cada pasta,
cada documento vira um PDF separado.

  Documento de identificacao: ate 4 fotos em uma unica pagina
  (empilhadas, ou duas linhas com duas quando forem 4).

  Demais documentos: cada foto vira uma pagina normal, e PDFs
  entram com todas as suas paginas.
"""

import os
import re
import shutil
import zipfile

import juntar
import foto_para_pdf

CAMPO_IDENTIFICACAO = "identificacao"


def nome_pasta_seguro(nome, reserva):
    """Limpa o nome do cliente para uso como nome de pasta."""
    nome = re.sub(r'[\\/:*?"<>|]', "", nome or "").strip()
    nome = re.sub(r"\s+", " ", nome)
    if not nome:
        nome = reserva
    return nome[:80]


def todas_fotos(caminhos):
    return all(juntar.eh_foto(c) for c in caminhos)


def montar_documento(campo_id, caminhos, caminho_saida):
    """Gera o PDF de um documento conforme a regra do campo."""
    if not caminhos:
        return False

    if campo_id == CAMPO_IDENTIFICACAO and todas_fotos(caminhos):
        foto_para_pdf.converter_documento(caminhos, caminho_saida)
    else:
        juntar.juntar(caminhos, caminho_saida)
    return True


def montar_zip(clientes, pasta_trabalho, caminho_zip):
    """
    clientes: lista de dicionarios
      { "nome": str, "documentos": [ {"id":..., "rotulo":..., "caminhos":[...]} ] }

    Retorna a lista de pastas criadas, na ordem.
    """
    if not clientes:
        raise ValueError("Nenhum cliente informado.")

    raiz = os.path.join(pasta_trabalho, "montagem")
    os.makedirs(raiz, exist_ok=True)

    usados = set()
    pastas = []

    for indice, cliente in enumerate(clientes):
        nome = nome_pasta_seguro(cliente.get("nome"), f"CLIENTE{indice + 1}")
        # evita duas pastas com o mesmo nome no mesmo ZIP
        base = nome
        contador = 2
        while nome.lower() in usados:
            nome = f"{base} ({contador})"
            contador += 1
        usados.add(nome.lower())

        pasta_cliente = os.path.join(raiz, nome)
        os.makedirs(pasta_cliente, exist_ok=True)

        for documento in cliente.get("documentos", []):
            caminhos = documento.get("caminhos") or []
            if not caminhos:
                continue
            rotulo = nome_pasta_seguro(documento.get("rotulo"), documento["id"])
            destino = os.path.join(pasta_cliente, f"{rotulo}.pdf")
            montar_documento(documento["id"], caminhos, destino)

        pastas.append(nome)

    with zipfile.ZipFile(caminho_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for pasta_atual, _, arquivos in os.walk(raiz):
            for arquivo in arquivos:
                completo = os.path.join(pasta_atual, arquivo)
                interno = os.path.relpath(completo, raiz)
                z.write(completo, arcname=interno)

    shutil.rmtree(raiz, ignore_errors=True)
    return pastas
