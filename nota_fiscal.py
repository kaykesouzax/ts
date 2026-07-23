"""
Leitura dos dados da nota fiscal.

A nota sai do sistema como PDF com texto, entao a leitura e feita
direto do conteudo, sem OCR.
"""

import re
import fitz

# CNPJ da concessionaria: aparece em toda nota. Quando existe outro
# CNPJ no documento, o cliente e pessoa juridica.
CNPJ_CONCESSIONARIA = "41.280.477/0007-40"


class NotaInvalida(Exception):
    pass


class ValorPlacaAusente(Exception):
    pass


def _texto(caminho):
    doc = fitz.open(caminho)
    partes = [pagina.get_text() for pagina in doc]
    doc.close()
    return " ".join(l.strip() for l in "\n".join(partes).split("\n"))


def _valores_do_destinatario(caminho):
    """
    Le o nome e o documento do bloco DESTINATARIO pela posicao.
    Os rotulos do DANFE usam fonte bem menor que os valores, o que
    permite separar um do outro com seguranca (nomes com hifen,
    por exemplo, deixam de ser cortados).
    """
    doc = fitz.open(caminho)
    pagina = doc[0]
    trechos = []
    for bloco in pagina.get_text("dict")["blocks"]:
        for linha in bloco.get("lines", []):
            for trecho in linha["spans"]:
                if trecho["text"].strip():
                    trechos.append((trecho["bbox"], trecho["text"].strip(), trecho["size"]))
    doc.close()

    rotulo = None
    for caixa, texto, _ in trechos:
        if "NOME/RAZ" in texto.upper():
            rotulo = caixa
            break
    if rotulo is None:
        return None, None

    abaixo = [
        (caixa, texto) for caixa, texto, tamanho in trechos
        if rotulo[3] < caixa[1] < rotulo[3] + 14 and tamanho > 6
    ]
    abaixo.sort(key=lambda item: item[0][0])
    if not abaixo:
        return None, None

    nome = abaixo[0][1]
    documento = None
    for caixa, texto in abaixo[1:]:
        limpo = texto.replace(" ", "")
        if re.fullmatch(r"\d{3}\.\d{3}\.\d{3}-\d{2}", limpo) or \
           re.fullmatch(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", limpo):
            documento = limpo
            break
    return nome, documento


def extrair(caminho):
    """
    Devolve os dados da nota fiscal.
    Levanta ValorPlacaAusente quando nao ha valor de emplacamento.
    """
    texto = _texto(caminho)
    if len(texto.strip()) < 200 or "DANFE" not in texto.upper():
        raise NotaInvalida("Nao foi possivel ler a nota fiscal.")

    dados = {}

    achado = re.search(r"EMISS[ÃA]O:\s*(\d{2}/\d{2}/\d{4})", texto)
    dados["data_nf"] = achado.group(1) if achado else ""

    achado = re.search(r"N[ºo]:\s*(\d{4,})", texto)
    # o numero vai sem os zeros a esquerda
    dados["nota_fiscal"] = achado.group(1).lstrip("0") if achado else ""

    nome, documento = _valores_do_destinatario(caminho)

    if not nome:
        achado = re.search(r"DESTINAT[ÁA]RIO:\s*(.+?)\s+[-–]\s+", texto)
        nome = achado.group(1).strip() if achado else ""
    dados["cliente"] = nome

    if not documento:
        cpf = re.search(r"\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b", texto)
        outros = [
            c for c in re.findall(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", texto)
            if c != CNPJ_CONCESSIONARIA
        ]
        documento = outros[0] if outros else (cpf.group(1) if cpf else "")

    dados["documento"] = documento or ""
    dados["tipo"] = "pj" if "/" in dados["documento"] else "pf"

    achado = re.search(r"CHASSI:\s*([A-Z0-9]{17})", texto)
    if achado:
        chassi = achado.group(1)
        # o recibo ja traz o "R" impresso na posicao 11 do chassi,
        # entao vai apenas o que vem depois dele
        if len(chassi) == 17 and chassi[10] == "R":
            dados["chassi"] = chassi[11:]
        else:
            dados["chassi"] = chassi[-6:]
    else:
        dados["chassi"] = ""

    achado = re.search(r"MODELO\s+([A-Z0-9][A-Z0-9 ]+?)\s+CHASSI", texto)
    dados["modelo"] = achado.group(1).strip() if achado else ""

    achado = re.search(r"ANO FAB\.?:\s*(\d{4})\s*ANO MOD\.?:\s*(\d{4})", texto)
    dados["ano_mod"] = f"{achado.group(1)}/{achado.group(2)}" if achado else ""

    achado = re.search(r"Emplacamento.{0,60}?R\$\s*([\d.]+,\d{2})", texto, re.I)
    if not achado:
        raise ValorPlacaAusente("Valor da Placa nao encontrado na NF")
    dados["valor_placa"] = achado.group(1)

    return dados
