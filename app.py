import os
import re
import uuid
import shutil
import json
import zipfile
from datetime import date

from flask import Flask, render_template, request, jsonify, send_file, abort

import compressao
import comprimir_imagem
import juntar
import pdf_para_foto
import foto_para_pdf
import placas as placas_mod
import nota_fiscal
import recibo as recibo_mod

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(BASE_DIR, "tmp_jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300mb: lote de placas com fotos de celular

MENU = [
    {
        "titulo": "Manipulacao de arquivos",
        "itens": [
            {"id": "comprimir", "nome": "Comprimir Arquivos", "ativo": True},
            {"id": "comprimir_imagem", "nome": "Comprimir Imagens", "ativo": True},
            {"id": "juntar", "nome": "Juntar Arquivos", "ativo": True},
            {"id": "pdf_para_foto", "nome": "Converter PDF para Foto", "ativo": True},
            {"id": "foto_para_pdf", "nome": "Converter Foto para PDF", "ativo": True},
        ],
    },
    {
        "titulo": "Financiamento",
        "itens": [
            {"id": "cdc", "nome": "Juncao de Arquivos CDC", "ativo": True},
        ],
    },
    {
        "titulo": "Placas",
        "itens": [
            {"id": "placas", "nome": "Placas", "ativo": True},
        ],
    },
]


CAMPOS_CDC = [
    {"id": "proposta",      "nome": "Proposta do veiculo",        "obrigatorio": True,  "paginas": 1,    "aviso_acima": False},
    {"id": "markup",        "nome": "Markup da venda",            "obrigatorio": True,  "paginas": 1,    "aviso_acima": False},
    {"id": "contrato",      "nome": "Contrato de compra e venda", "obrigatorio": True,  "paginas": 8,    "aviso_acima": False},
    {"id": "aprovacao",     "nome": "Aprovacao do banco",         "obrigatorio": True,  "paginas": None, "aviso_acima": False},
    {"id": "bonus",         "nome": "Bonus",                      "obrigatorio": False, "paginas": 2,    "aviso_acima": True},
    {"id": "identificacao", "nome": "Documentos de identificacao", "obrigatorio": True, "paginas": None, "aviso_acima": False},
    {"id": "residencia",    "nome": "Comp. de residencia",        "obrigatorio": True,  "paginas": None, "aviso_acima": False},
    {"id": "pagamento",     "nome": "Pagamento",                  "obrigatorio": False, "paginas": None, "aviso_acima": False},
]


# "rotulo" e o nome mostrado na tela; "arquivo" e o nome do PDF na pasta
CAMPOS_PLACAS = {
    "pf": [
        {"id": "nota_fiscal",   "rotulo": "NOTA FISCAL",                "arquivo": "NOTA FISCAL"},
        {"id": "identificacao", "rotulo": "DOCUMENTO DE IDENTIFICACAO",  "arquivo": "Doc"},
        {"id": "residencia",    "rotulo": "COMP. DE RESIDENCIA",         "arquivo": "COMP. DE RESIDENCIA"},
        {"id": "recibo",        "rotulo": "RECIBO",                      "arquivo": "RECIBO"},
    ],
    "pj": [
        {"id": "nota_fiscal",     "rotulo": "NOTA FISCAL",                                   "arquivo": "NOTA FISCAL"},
        {"id": "identificacao",   "rotulo": "DOCUMENTO DE IDENTIFICACAO DO DONO DA EMPRESA", "arquivo": "Doc"},
        {"id": "residencia",      "rotulo": "COMP. DE RESIDENCIA COMERCIAL (CARTAO CNPJ)",   "arquivo": "COMP. DE RESIDENCIA COMERCIAL"},
        {"id": "contrato_social", "rotulo": "CONTRATO SOCIAL OU REQUERIMENTO",               "arquivo": "Contrato Social"},
        {"id": "recibo",          "rotulo": "RECIBO",                                        "arquivo": "RECIBO"},
    ],
}


def novo_job():
    job_id = uuid.uuid4().hex
    caminho = os.path.join(JOBS_DIR, job_id)
    os.makedirs(caminho, exist_ok=True)
    return job_id, caminho


def caminho_job(job_id):
    if not job_id.isalnum():
        abort(400)
    caminho = os.path.join(JOBS_DIR, job_id)
    if not os.path.isdir(caminho):
        abort(404)
    return caminho


def nome_seguro(nome, padrao):
    """Limpa o nome informado pelo usuario e garante a extensao .pdf."""
    nome = re.sub(r'[\\/:*?"<>|]', "", nome or "").strip()
    if not nome:
        nome = padrao
    nome = nome[:120]
    if not nome.lower().endswith(".pdf"):
        nome = nome + ".pdf"
    return nome


def formatar_tamanho(num_bytes):
    if num_bytes < 1024:
        return f"{num_bytes} B"
    kb = num_bytes / 1024
    if kb < 1024:
        return f"{kb:.1f} KB"
    mb = kb / 1024
    return f"{mb:.2f} MB"


@app.errorhandler(413)
def arquivo_muito_grande(erro):
    limite_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return jsonify({
        "erro": f"Os arquivos enviados passam do limite de {limite_mb} MB. "
                f"Gere o lote em duas partes ou comprima as imagens antes."
    }), 413


@app.route("/")
def index():
    return render_template("index.html", menu=MENU, aba_inicial="comprimir",
                           campos_cdc=CAMPOS_CDC, campos_placas=CAMPOS_PLACAS)


@app.route("/api/comprimir/enviar", methods=["POST"])
def comprimir_enviar():
    arquivo = request.files.get("arquivo")
    modo = request.form.get("modo", "basica")
    if modo not in ("basica", "alienacao"):
        modo = "basica"

    if arquivo is None or arquivo.filename == "":
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400
    if not arquivo.filename.lower().endswith(".pdf"):
        return jsonify({"erro": "Envie um arquivo em formato PDF."}), 400

    job_id, pasta = novo_job()
    entrada = os.path.join(pasta, "entrada.pdf")
    arquivo.save(entrada)

    try:
        with open(entrada, "rb") as f:
            cabecalho = f.read(5)
        if cabecalho != b"%PDF-":
            shutil.rmtree(pasta, ignore_errors=True)
            return jsonify({"erro": "O arquivo enviado nao parece ser um PDF valido."}), 400

        tamanho_original = os.path.getsize(entrada)
        if modo == "alienacao":
            resultado = compressao.comprimir(entrada, pasta)
        else:
            resultado = compressao.comprimir_basico(entrada, pasta)
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel processar este arquivo."}), 500

    nome_final = os.path.basename(resultado["caminho"])
    with open(os.path.join(pasta, "resultado.txt"), "w") as f:
        f.write(nome_final)

    return jsonify({
        "job_id": job_id,
        "modo": modo,
        "tamanho_original": formatar_tamanho(tamanho_original),
        "tamanho_final": formatar_tamanho(resultado["tamanho_final"]),
        "metodo": resultado["metodo"],
        "alerta": resultado["alerta"],
        "meta_atingida": resultado.get("meta_atingida", True),
    })


@app.route("/api/comprimir/baixar/<job_id>")
def comprimir_baixar(job_id):
    pasta = caminho_job(job_id)
    marcador = os.path.join(pasta, "resultado.txt")
    if not os.path.isfile(marcador):
        abort(404)
    with open(marcador) as f:
        nome_arquivo = f.read().strip()
    caminho_arquivo = os.path.join(pasta, nome_arquivo)
    if not os.path.isfile(caminho_arquivo):
        abort(404)
    return send_file(caminho_arquivo, as_attachment=True, download_name="documento_comprimido.pdf")


@app.route("/api/comprimir/reiniciar/<job_id>", methods=["POST"])
def comprimir_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


EXTENSOES_ACEITAS = juntar.EXTENSOES_FOTO + juntar.EXTENSOES_PDF


def extensao_ok(nome):
    return nome.lower().endswith(EXTENSOES_ACEITAS)


@app.route("/api/juntar/enviar", methods=["POST"])
def juntar_enviar():
    arquivos = request.files.getlist("arquivos")
    if not arquivos or all(a.filename == "" for a in arquivos):
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    validos = [a for a in arquivos if a.filename and extensao_ok(a.filename)]
    if not validos:
        return jsonify({"erro": "Envie arquivos em PDF ou foto."}), 400
    if len(validos) < 2:
        return jsonify({"erro": "Envie ao menos dois arquivos para juntar."}), 400

    job_id, pasta = novo_job()
    caminhos_ordenados = []
    try:
        for indice, arquivo in enumerate(validos):
            base, ext = os.path.splitext(arquivo.filename)
            ext = ext.lower()
            # nome sequencial para preservar a ordem enviada e evitar colisao
            nome_disco = f"{indice:03d}{ext}"
            caminho = os.path.join(pasta, nome_disco)
            arquivo.save(caminho)
            caminhos_ordenados.append(caminho)

        saida = os.path.join(pasta, "juntado.pdf")
        juntar.juntar(caminhos_ordenados, saida)
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel juntar os arquivos."}), 500

    with open(os.path.join(pasta, "resultado.txt"), "w") as f:
        f.write("juntado.pdf")

    return jsonify({
        "job_id": job_id,
        "tamanho_final": formatar_tamanho(os.path.getsize(saida)),
    })


@app.route("/api/juntar/baixar/<job_id>")
def juntar_baixar(job_id):
    pasta = caminho_job(job_id)
    caminho_arquivo = os.path.join(pasta, "juntado.pdf")
    if not os.path.isfile(caminho_arquivo):
        abort(404)

    nome = nome_seguro(request.args.get("nome"), "Merged doc")
    return send_file(caminho_arquivo, as_attachment=True, download_name=nome)


@app.route("/api/juntar/reiniciar/<job_id>", methods=["POST"])
def juntar_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/pdf_para_foto/enviar", methods=["POST"])
def pdf_para_foto_enviar():
    arquivo = request.files.get("arquivo")
    if arquivo is None or arquivo.filename == "":
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400
    if not arquivo.filename.lower().endswith(".pdf"):
        return jsonify({"erro": "Envie um arquivo em formato PDF."}), 400

    job_id, pasta = novo_job()
    entrada = os.path.join(pasta, "entrada.pdf")
    arquivo.save(entrada)

    try:
        with open(entrada, "rb") as f:
            if f.read(5) != b"%PDF-":
                shutil.rmtree(pasta, ignore_errors=True)
                return jsonify({"erro": "O arquivo enviado nao parece ser um PDF valido."}), 400

        saidas = os.path.join(pasta, "imagens")
        os.makedirs(saidas, exist_ok=True)
        imagens = pdf_para_foto.converter(entrada, saidas)
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel converter este arquivo."}), 500

    total = len(imagens)
    if total == 1:
        # uma pagina: entrega o proprio JPG
        final = os.path.join(pasta, "resultado.jpg")
        shutil.move(imagens[0], final)
        tipo = "jpg"
        tamanho = os.path.getsize(final)
    else:
        # varias paginas: monta um ZIP com todas
        final = os.path.join(pasta, "resultado.zip")
        with zipfile.ZipFile(final, "w", zipfile.ZIP_DEFLATED) as z:
            for img in imagens:
                z.write(img, arcname=os.path.basename(img))
        tipo = "zip"
        tamanho = os.path.getsize(final)

    with open(os.path.join(pasta, "tipo.txt"), "w") as f:
        f.write(tipo)

    return jsonify({
        "job_id": job_id,
        "tipo": tipo,
        "paginas": total,
        "tamanho_final": formatar_tamanho(tamanho),
    })


@app.route("/api/pdf_para_foto/baixar/<job_id>")
def pdf_para_foto_baixar(job_id):
    pasta = caminho_job(job_id)
    marcador = os.path.join(pasta, "tipo.txt")
    if not os.path.isfile(marcador):
        abort(404)
    with open(marcador) as f:
        tipo = f.read().strip()

    if tipo == "jpg":
        caminho = os.path.join(pasta, "resultado.jpg")
        nome = "pagina_01.jpg"
    else:
        caminho = os.path.join(pasta, "resultado.zip")
        nome = "paginas.zip"

    if not os.path.isfile(caminho):
        abort(404)
    return send_file(caminho, as_attachment=True, download_name=nome)


@app.route("/api/pdf_para_foto/reiniciar/<job_id>", methods=["POST"])
def pdf_para_foto_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/foto_para_pdf/enviar", methods=["POST"])
def foto_para_pdf_enviar():
    arquivos = request.files.getlist("arquivos")
    modo = request.form.get("modo", "fotos")
    if modo not in ("fotos", "documentos"):
        modo = "fotos"

    if not arquivos or all(a.filename == "" for a in arquivos):
        return jsonify({"erro": "Nenhuma foto enviada."}), 400

    validos = [a for a in arquivos
               if a.filename and a.filename.lower().endswith(juntar.EXTENSOES_FOTO)]
    if not validos:
        return jsonify({"erro": "Envie arquivos em formato de foto."}), 400

    if modo == "documentos" and len(validos) > foto_para_pdf.MAX_DOCUMENTOS:
        return jsonify({
            "erro": "Neste modo o limite e de 3 fotos por pagina. "
                    "Faca o processo em duas vezes ou use o modo Juncao de Fotos."
        }), 400

    job_id, pasta = novo_job()
    caminhos = []
    try:
        for indice, arquivo in enumerate(validos):
            ext = os.path.splitext(arquivo.filename)[1].lower()
            caminho = os.path.join(pasta, f"{indice:03d}{ext}")
            arquivo.save(caminho)
            caminhos.append(caminho)

        saida = os.path.join(pasta, "gerado.pdf")
        paginas = foto_para_pdf.converter(caminhos, saida, modo=modo)
    except ValueError as erro:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": str(erro)}), 400
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel gerar o PDF."}), 500

    return jsonify({
        "job_id": job_id,
        "paginas": paginas,
        "tamanho_final": formatar_tamanho(os.path.getsize(saida)),
    })


@app.route("/api/foto_para_pdf/baixar/<job_id>")
def foto_para_pdf_baixar(job_id):
    pasta = caminho_job(job_id)
    caminho = os.path.join(pasta, "gerado.pdf")
    if not os.path.isfile(caminho):
        abort(404)
    return send_file(caminho, as_attachment=True,
                     download_name=nome_seguro(request.args.get("nome"), "Merged img"))


@app.route("/api/foto_para_pdf/reiniciar/<job_id>", methods=["POST"])
def foto_para_pdf_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/cdc/enviar", methods=["POST"])
def cdc_enviar():
    job_id, pasta = novo_job()
    caminhos_ordenados = []
    contador = 0

    try:
        # percorre os campos na ordem canonica definida em CAMPOS_CDC
        for campo in CAMPOS_CDC:
            enviados = request.files.getlist("campo_" + campo["id"])
            for arquivo in enviados:
                if not arquivo.filename:
                    continue
                if not extensao_ok(arquivo.filename):
                    continue
                ext = os.path.splitext(arquivo.filename)[1].lower()
                caminho = os.path.join(pasta, f"{contador:03d}{ext}")
                arquivo.save(caminho)
                caminhos_ordenados.append(caminho)
                contador += 1

        if not caminhos_ordenados:
            shutil.rmtree(pasta, ignore_errors=True)
            return jsonify({"erro": "Nenhum documento anexado."}), 400

        saida = os.path.join(pasta, "cdc.pdf")
        paginas = juntar.juntar(caminhos_ordenados, saida)
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel gerar o arquivo."}), 500

    return jsonify({
        "job_id": job_id,
        "paginas": paginas,
        "tamanho_final": formatar_tamanho(os.path.getsize(saida)),
    })


@app.route("/api/cdc/baixar/<job_id>")
def cdc_baixar(job_id):
    pasta = caminho_job(job_id)
    caminho = os.path.join(pasta, "cdc.pdf")
    if not os.path.isfile(caminho):
        abort(404)
    return send_file(caminho, as_attachment=True,
                     download_name=nome_seguro(request.args.get("nome"), "CDC"))


@app.route("/api/cdc/reiniciar/<job_id>", methods=["POST"])
def cdc_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/placas/analisar_nf", methods=["POST"])
def placas_analisar_nf():
    """Le a nota fiscal e devolve os dados para preencher a tela."""
    arquivo = request.files.get("arquivo")
    if arquivo is None or arquivo.filename == "":
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400
    if not arquivo.filename.lower().endswith(".pdf"):
        return jsonify({"erro": "A nota fiscal precisa estar em PDF."}), 400

    job_id, pasta = novo_job()
    caminho = os.path.join(pasta, "nf.pdf")
    try:
        arquivo.save(caminho)
        dados = nota_fiscal.extrair(caminho)
    except nota_fiscal.ValorPlacaAusente:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Valor da Placa nao encontrado na NF", "bloqueia": True}), 400
    except nota_fiscal.NotaInvalida as erro:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": str(erro)}), 400
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel ler a nota fiscal."}), 500

    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"dados": dados})


@app.route("/api/placas/enviar", methods=["POST"])
def placas_enviar():
    try:
        clientes_info = json.loads(request.form.get("clientes", "[]"))
    except ValueError:
        return jsonify({"erro": "Dados dos clientes invalidos."}), 400

    if not clientes_info:
        return jsonify({"erro": "Adicione ao menos um cliente."}), 400

    job_id, pasta = novo_job()
    entradas = os.path.join(pasta, "entradas")
    os.makedirs(entradas, exist_ok=True)

    try:
        clientes = []
        for indice, info in enumerate(clientes_info):
            tipo = info.get("tipo", "pf")
            if tipo not in CAMPOS_PLACAS:
                tipo = "pf"

            documentos = []
            for campo in CAMPOS_PLACAS[tipo]:
                chave = f"c{indice}_{campo['id']}"
                enviados = request.files.getlist(chave)
                caminhos = []
                for ordem, arquivo in enumerate(enviados):
                    if not arquivo.filename or not extensao_ok(arquivo.filename):
                        continue
                    ext = os.path.splitext(arquivo.filename)[1].lower()
                    destino = os.path.join(entradas, f"{indice:02d}_{campo['id']}_{ordem:02d}{ext}")
                    arquivo.save(destino)
                    caminhos.append(destino)

                if caminhos:
                    documentos.append({
                        "id": campo["id"],
                        "rotulo": campo.get("arquivo", campo["rotulo"]),
                        "caminhos": caminhos,
                    })

            # gera o recibo preenchido quando ha nota fiscal e recibo em branco
            caminho_nf = None
            indice_recibo = None
            for posicao, documento in enumerate(documentos):
                if documento["id"] == "nota_fiscal" and documento["caminhos"]:
                    caminho_nf = documento["caminhos"][0]
                if documento["id"] == "recibo":
                    indice_recibo = posicao

            if caminho_nf and indice_recibo is not None:
                try:
                    dados_nf = nota_fiscal.extrair(caminho_nf)
                    branco = documentos[indice_recibo]["caminhos"][0]
                    preenchido = os.path.join(entradas, f"{indice:02d}_recibo_final.pdf")
                    recibo_mod.preencher(branco, dados_nf, preenchido)
                    documentos[indice_recibo]["caminhos"] = [preenchido]
                except nota_fiscal.ValorPlacaAusente:
                    shutil.rmtree(pasta, ignore_errors=True)
                    return jsonify({"erro": "Valor da Placa nao encontrado na NF"}), 400
                except Exception:
                    pass  # sem preenchimento automatico, segue com o arquivo enviado

            clientes.append({"nome": info.get("nome", ""), "documentos": documentos})

        individual = request.form.get("individual") == "1"
        caminho_zip = os.path.join(pasta, "placas.zip")
        pastas = placas_mod.montar_zip(clientes, pasta, caminho_zip, compactar=not individual)
    except ValueError as erro:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": str(erro)}), 400
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel gerar o arquivo."}), 500

    return jsonify({
        "job_id": job_id,
        "clientes": len(pastas),
        "pastas": pastas,
        "tamanho_final": formatar_tamanho(os.path.getsize(caminho_zip)),
    })


@app.route("/api/placas/baixar/<job_id>")
def placas_baixar(job_id):
    pasta = caminho_job(job_id)
    caminho = os.path.join(pasta, "placas.zip")
    if not os.path.isfile(caminho):
        abort(404)

    padrao = "PLACAS " + date.today().strftime("%d.%m")
    nome = re.sub(r'[\\/:*?"<>|]', "", request.args.get("nome") or "").strip()
    if not nome:
        nome = padrao
    nome = nome[:120]
    if not nome.lower().endswith(".zip"):
        nome = nome + ".zip"
    return send_file(caminho, as_attachment=True, download_name=nome)


@app.route("/api/placas/reiniciar/<job_id>", methods=["POST"])
def placas_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/comprimir_imagem/enviar", methods=["POST"])
def comprimir_imagem_enviar():
    arquivo = request.files.get("arquivo")
    modo = request.form.get("modo", "simples")
    if modo not in ("simples", "avancada"):
        modo = "simples"

    if arquivo is None or arquivo.filename == "":
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400
    if not comprimir_imagem.eh_imagem(arquivo.filename):
        return jsonify({"erro": "Envie um arquivo em formato de imagem."}), 400

    job_id, pasta = novo_job()
    extensao = os.path.splitext(arquivo.filename)[1].lower()
    entrada = os.path.join(pasta, "entrada" + extensao)

    try:
        arquivo.save(entrada)
        tamanho_original = os.path.getsize(entrada)
        resultado = comprimir_imagem.comprimir(entrada, pasta, modo)
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        return jsonify({"erro": "Nao foi possivel processar esta imagem."}), 500

    with open(os.path.join(pasta, "resultado.txt"), "w") as f:
        f.write(os.path.basename(resultado["caminho"]))

    return jsonify({
        "job_id": job_id,
        "modo": modo,
        "tamanho_original": formatar_tamanho(tamanho_original),
        "tamanho_final": formatar_tamanho(resultado["tamanho_final"]),
        "dimensao_inicial": f"{resultado['largura_inicial']}x{resultado['altura_inicial']}",
        "dimensao_final": f"{resultado['largura']}x{resultado['altura']}",
        "reduzida": resultado["reduzida"],
        "sem_ganho": resultado.get("sem_ganho", False),
    })


@app.route("/api/comprimir_imagem/baixar/<job_id>")
def comprimir_imagem_baixar(job_id):
    pasta = caminho_job(job_id)
    marcador = os.path.join(pasta, "resultado.txt")
    if not os.path.isfile(marcador):
        abort(404)
    with open(marcador) as f:
        nome_arquivo = f.read().strip()
    caminho = os.path.join(pasta, nome_arquivo)
    if not os.path.isfile(caminho):
        abort(404)

    extensao = os.path.splitext(nome_arquivo)[1].lower() or ".jpg"
    nome = re.sub(r'[\\/:*?"<>|]', "", request.args.get("nome") or "").strip()
    if not nome:
        nome = "Imagem Comprimida"
    nome = nome[:120]
    if not nome.lower().endswith(extensao):
        nome = nome + extensao
    return send_file(caminho, as_attachment=True, download_name=nome)


@app.route("/api/comprimir_imagem/reiniciar/<job_id>", methods=["POST"])
def comprimir_imagem_reiniciar(job_id):
    pasta = caminho_job(job_id)
    shutil.rmtree(pasta, ignore_errors=True)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
