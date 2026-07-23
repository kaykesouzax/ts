"""
Preenchimento do recibo.

O recibo em branco chega com duas vias empilhadas na mesma folha.
O modulo corta para uma via, aumenta a caixa do nome (que cortava
nomes longos), deixa a fonte automatica e preenche com os dados
lidos da nota fiscal.
"""

from datetime import date
import fitz

# ordem dos campos da via, da esquerda para a direita e de cima para baixo
ORDEM_CAMPOS = [
    "dia", "mes", "cliente", "nota_fiscal", "chassi",
    "documento", "modelo", "data_nf", "ano_mod", "valor_placa",
]


class ReciboInvalido(Exception):
    pass


def _linhas_largas(pagina):
    """Bordas horizontais que atravessam a folha: topo, divisoria e base."""
    larguras = []
    for desenho in pagina.get_drawings():
        r = desenho["rect"]
        if r.height < 3 and r.width > 450:
            larguras.append(round(r.y0, 1))
    return sorted(set(larguras))


def _area_da_via(pagina, campos_via):
    """Descobre a area de corte da via a partir das bordas da folha."""
    linhas = _linhas_largas(pagina)
    if len(linhas) >= 3:
        topo, divisoria = linhas[0], linhas[1]
        return fitz.Rect(38, topo - 4, 553, divisoria + 3)

    # sem as bordas, usa os proprios campos como referencia
    primeiro = min(c.rect.y0 for c in campos_via)
    return fitz.Rect(38, max(0, primeiro - 75), 553, primeiro + 275)


def preencher(caminho_branco, dados, caminho_saida):
    """
    Gera o recibo preenchido em via unica.
    dados: dicionario com as chaves de ORDEM_CAMPOS (dia e mes sao
    preenchidos com a data de hoje quando ausentes).
    """
    doc = fitz.open(caminho_branco)
    if doc.page_count < 1:
        doc.close()
        raise ReciboInvalido("O recibo enviado esta vazio.")

    pagina = doc[0]
    campos = list(pagina.widgets())
    if len(campos) < len(ORDEM_CAMPOS):
        doc.close()
        raise ReciboInvalido("O recibo enviado nao tem os campos esperados.")

    # a via de cima e a metade superior dos campos
    campos.sort(key=lambda w: (round(w.rect.y0, 1), w.rect.x0))
    quantidade = len(ORDEM_CAMPOS)
    via = campos[:quantidade]
    resto = campos[quantidade:]

    hoje = date.today()
    valores = dict(dados)
    valores.setdefault("dia", f"{hoje.day:02d}")
    valores.setdefault("mes", f"{hoje.month:02d}")

    # a caixa do nome usa a linha inteira da tabela
    linha_cliente = via[ORDEM_CAMPOS.index("cliente")].rect
    largura_util = fitz.Rect(linha_cliente.x0, linha_cliente.y0 - 2.2,
                             478.0, linha_cliente.y0 + 10.5)

    for indice, campo in enumerate(via):
        nome = ORDEM_CAMPOS[indice]
        if nome == "cliente":
            campo.rect = largura_util
        campo.text_fontsize = 0          # fonte automatica: encolhe se precisar
        campo.field_value = str(valores.get(nome, "") or "")
        campo.update()

    # remove os campos da via que sera descartada
    for campo in resto:
        pagina.delete_widget(campo)

    pagina.set_cropbox(_area_da_via(pagina, via))
    doc.save(caminho_saida, garbage=4, deflate=True)
    doc.close()
