const path = require('path');
const fs = require('fs');

/**
 * Onde ficam o banco e os arquivos.
 *
 * Por padrão, dentro do projeto — que é o certo para desenvolvimento e para
 * hospedagem sem disco. Em hospedagem COM disco, o disco é montado num
 * caminho fora do projeto (por exemplo /var/data) e o código não pode
 * assumir que está ao lado dele: a cada implantação o projeto é recriado, e
 * só o disco sobrevive.
 *
 * Definindo DADOS_DIR, banco e arquivos passam a morar lá — sem mexer em
 * código, que é o que evita retrabalho quando o cliente aprovar o disco.
 */
const RAIZ = __dirname;
const DADOS = process.env.DADOS_DIR ? path.resolve(process.env.DADOS_DIR) : RAIZ;

const BANCO = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DADOS, 'imobiliaria.db');

const STORAGE = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(DADOS, 'storage');

// A pasta pode não existir na primeira subida — o repositório não versiona
// `storage/`, e o disco montado começa vazio.
function garantirPastas() {
  for (const pasta of [DADOS, STORAGE, path.join(STORAGE, 'documentos')]) {
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
  }
}

module.exports = { RAIZ, DADOS, BANCO, STORAGE, garantirPastas };
