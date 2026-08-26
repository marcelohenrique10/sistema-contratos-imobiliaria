const AdmZip = require('adm-zip');

const DOC_XML = 'word/document.xml';

function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lerDocumentoXml(caminho) {
  const zip = new AdmZip(caminho);
  return { zip, xml: zip.readAsText(DOC_XML) };
}

function gravarDocumentoXml(zip, xml, destino) {
  zip.updateFile(DOC_XML, Buffer.from(xml, 'utf8'));
  zip.writeZip(destino);
}

// Troca os [PLACEHOLDER] pelos valores. O que não tiver valor vira string
// vazia, para não sobrar colchete no documento entregue ao cliente.
function substituirPlaceholders(xml, valores) {
  return xml.replace(/\[([A-Z0-9_]+)\]/g, (original, chave) => {
    if (!(chave in valores)) return original;
    return escaparXml(valores[chave]);
  });
}

function listarPlaceholders(xml) {
  const semTags = xml.replace(/<[^>]+>/g, '');
  return [...new Set(semTags.match(/\[[A-Z0-9_]+\]/g) || [])];
}

// ---------- Tabelas ----------

function extrairLinhas(tabelaXml) {
  return tabelaXml.match(/<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
}

function extrairCelulas(linhaXml) {
  return linhaXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
}

// Escreve `texto` na primeira caixa de texto da célula e esvazia as demais,
// preservando a formatação original (fonte, alinhamento, bordas).
function definirTextoCelula(celulaXml, texto) {
  let primeira = true;
  return celulaXml.replace(/(<w:t(?: [^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_, abre, __, fecha) => {
    if (primeira) {
      primeira = false;
      const tag = abre.includes('xml:space') ? abre : abre.replace('<w:t', '<w:t xml:space="preserve"');
      return `${tag}${escaparXml(texto)}${fecha}`;
    }
    return `${abre}${fecha}`;
  });
}

// `textos` é posicional, uma entrada por célula. null/undefined mantém a
// célula intacta — usado nas células mescladas, que não têm texto próprio.
function definirTextosLinha(linhaXml, textos) {
  let i = 0;
  return linhaXml.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (celula) => {
    const texto = textos[i++];
    return texto === undefined || texto === null ? celula : definirTextoCelula(celula, texto);
  });
}

// Substitui o miolo da primeira tabela do documento pelas linhas informadas,
// mantendo as propriedades da tabela (<w:tblPr>, <w:tblGrid>).
function substituirLinhasDaPrimeiraTabela(xml, novasLinhas) {
  const tabela = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (!tabela) return xml;

  const original = tabela[0];
  const primeiraLinha = original.search(/<w:tr(?: [^>]*)?>/);
  const cabecalho = original.slice(0, primeiraLinha);

  const nova = `${cabecalho}${novasLinhas.join('')}</w:tbl>`;
  return xml.replace(original, nova);
}

module.exports = {
  lerDocumentoXml,
  gravarDocumentoXml,
  substituirPlaceholders,
  listarPlaceholders,
  extrairLinhas,
  extrairCelulas,
  definirTextoCelula,
  definirTextosLinha,
  substituirLinhasDaPrimeiraTabela,
  escaparXml
};
