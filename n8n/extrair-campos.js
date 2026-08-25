// Código do nó "Extrair Campos" do n8n.
// Fonte da verdade: este arquivo. O build injeta no workflow JSON.
//
// Lê uma linha da planilha de respostas e monta o payload que a aplicação
// espera. Os títulos abaixo têm que bater exatamente com os do formulário
// (ver forms/apps-script-formulario.gs).

const d = $input.item.json;

// Lookup tolerante: ignora espaços/maiúsculas e sufixos _1/_2 que o n8n
// acrescenta quando a planilha tem cabeçalhos repetidos.
const v = (campo) => {
  const alvo = campo.trim().toLowerCase();
  const candidatos = [];
  for (const chave of Object.keys(d)) {
    const k = chave.trim().toLowerCase();
    if (k === alvo || k === `${alvo}_1` || k === `${alvo}_2`) {
      candidatos.push(String(d[chave] ?? '').trim());
    }
  }
  return candidatos.find((c) => c !== '') ?? '';
};

const sim = (campo) => v(campo).toLowerCase().startsWith('s');

// A lista suspensa pode vir com prefixo numérico ("1. Contrato...")
const tipo = v('Qual documento você deseja gerar?')
  .replace(/^\s*\d+\s*[.)-]\s*/, '')
  .trim();

const ehPessoaJuridica = v('O contratante é pessoa física ou jurídica?')
  .toLowerCase()
  .includes('jur');

// ---------- Dados gerais ----------
const dadosGerais = {
  dataHora: v('Carimbo de data/hora'),
  dataDocumento: v('Data do documento'),
  cidadeUf: v('Cidade/UF da assinatura - ex:(Aracruz/ES)'),
  responsavel: v('Responsável interno pelo preenchimento'),
};

// ---------- Contratante ----------
// Os modelos têm um único bloco de "comprador". Para pessoa jurídica a razão
// social ocupa o lugar do nome e o CNPJ o do CPF; o representante legal vai
// num bloco à parte.
const compradorPf = {
  nome: v('Nome completo do comprador'),
  cpf: v('CPF do comprador'),
  nacionalidade: v('Nacionalidade do comprador'),
  estadoCivil: v('Estado civil do comprador'),
  profissao: v('Profissão do comprador'),
  rg: v('RG do comprador'),
  orgaoEmissorRg: v('Órgão emissor do RG do comprador'),
  endereco: v('Endereço completo do comprador'),
  cep: v('CEP do comprador'),
  telefone: v('Telefone com DDD do comprador'),
  email: v('E-mail do comprador'),
};

const compradorPj = {
  nome: v('Razão social do contratante'),
  cpf: v('CNPJ do contratante'),
  nacionalidade: '',
  estadoCivil: '',
  profissao: '',
  rg: '',
  orgaoEmissorRg: '',
  endereco: v('Endereço completo do contratante PJ'),
  cep: v('CEP do contratante PJ'),
  telefone: v('Telefone com DDD do contratante PJ'),
  email: v('E-mail do contratante PJ'),
};

const comprador = ehPessoaJuridica ? compradorPj : compradorPf;

const representante = ehPessoaJuridica ? {
  nome: v('Nome do representante legal'),
  cpf: v('CPF do representante legal'),
  rg: v('RG do representante legal'),
  orgaoEmissorRg: v('Órgão emissor do RG do representante legal'),
  nacionalidade: v('Nacionalidade do representante legal'),
  profissao: v('Profissão do representante legal'),
} : null;

// ---------- Cônjuge ----------
const temConjuge = !ehPessoaJuridica
  && sim('O comprador possui cônjuge que deve constar no documento?');

const conjuge = temConjuge ? {
  nome: v('Nome completo do cônjuge'),
  cpf: v('CPF do cônjuge'),
  nacionalidade: v('Nacionalidade do cônjuge'),
  profissao: v('Profissão do cônjuge'),
  rg: v('RG do cônjuge'),
  orgaoEmissorRg: v('Órgão emissor do RG do cônjuge'),
} : null;

// ---------- Testemunhas ----------
const testemunhas = [1, 2]
  .map((n) => ({ nome: v(`Nome da testemunha ${n}`), cpf: v(`CPF da testemunha ${n}`) }))
  .filter((t) => t.nome || t.cpf);

// ---------- Intermediadora ----------
const intermediadora = sim('Existe construtora intermediadora nesta operação?') ? {
  razaoSocial: v('Razão social da intermediadora'),
  cnpj: v('CNPJ da intermediadora'),
  creci: v('CRECI da intermediadora'),
  endereco: v('Endereço completo da intermediadora'),
  representante: v('Nome do representante da intermediadora'),
} : null;

// ---------- Unidade ----------
const unidade = {
  tipo: v('Tipo da unidade - ex:(apartamento)'),
  numero: v('Número da unidade'),
  numeroExtenso: v('Número da unidade por extenso'),
  vagasGaragem: v('Quantidade de vagas de garagem'),
  numerosVagas: v('Números das vagas'),
  areaPrivativa: v('Área privativa (m²)'),
  areaConstrucao: v('Área de construção (m²)'),
  fracaoIdeal: v('Fração ideal'),
  descricaoPlanta: v('Descrição da planta - ex:( 3 quartos, 1 suíte, varanda gourmet...)'),
};

// ---------- Compra e venda ----------
const formaAquisicao = v('Forma de aquisição');
const aVista = formaAquisicao.toLowerCase().includes('vista');

const parcelas = [];
if (!aVista) {
  for (let n = 1; n <= 5; n++) {
    const tipoParcela = v(`Tipo da parcela ${n}`);
    if (!tipoParcela) continue;
    parcelas.push({
      numero: n,
      tipo: tipoParcela,
      vencimentoInicial: v(`Data inicial de vencimento da parcela ${n}`),
      valorUnitario: v(`Valor unitário da parcela ${n}`),
      quantidade: v(`Quantidade da parcela ${n}`),
      percentual: v(`Percentual da parcela ${n}`),
      reajustavel: v(`A parcela ${n} é reajustável?`),
      indice: v(`Índice da parcela ${n}`),
      formaPagamento: v(`Forma de pagamento da parcela ${n}`),
    });
  }
}

const compraVenda = {
  unidade,
  precoTotal: v('Preço total do imóvel (R$)'),
  precoExtenso: v('Preço total por extenso'),
  formaAquisicao,
  aVista,
  qtdTiposParcelas: v('Quantos tipos de parcelas existem nesta negociação?'),
  parcelas,
  observacaoEspecial: sim('Existe alguma observação especial na negociação?')
    ? v('Descreva a observação especial') : '',
  descricaoPersonalizacao: sim('Existe personalização de unidade / ajuste comercial que precisa constar?')
    ? v('Descreva a personalização / ajuste') : '',
};

// ---------- Empréstimo ----------
const emprestimo = {
  dataCompromisso: v('Data do compromisso de compra e venda'),
  nomePj: v('Nome da Pessoa Jurídica'),
  cnpj: v('CNPJ da Pessoa Jurídica'),
  endereco: v('Endereço completo da Pessoa Jurídica'),
  cep: v('CEP da Pessoa Jurídica'),
  enderecoImovel: v('Endereço do imóvel'),
  residencia: v('Residência?'),
};

// ---------- SCP ----------
const scp = {
  razaoSocial: v('Razão social do empreendimento'),
  cnpj: v('CNPJ do empreendimento'),
  enderecoEmpresa: v('Endereço completo da empresa'),
  cepEmpresa: v('CEP da empresa'),
  valorEntrada: v('Valor da Entrada'),
  numeroUnidades: v('Número de Unidades'),
};

// ---------- Monta o bloco específico do tipo escolhido ----------
const blocosPorTipo = {
  'Contrato de Promessa de Compra e Venda': { compraVenda },
  'Anexo ao Contrato de Promessa de Compra e Venda': { anexo: { tipoUnidade: unidade.tipo, numeroUnidade: unidade.numero, numeroUnidadeExtenso: unidade.numeroExtenso } },
  'Termo de Anuência com Outorga de Poderes': {},
  'Termo de Ciência e Anuência para Empréstimo': { emprestimo },
  'Termo de Adesão Preliminar SCP': { scp },
};

return [{
  json: {
    // Campos planos, usados por /webhook/cliente e /webhook/contrato
    tipoDocumento: tipo,
    nome: comprador.nome,
    cpfCnpj: comprador.cpf,
    telefone: comprador.telefone,
    email: comprador.email,
    responsavel: dadosGerais.responsavel,
    dataHora: dadosGerais.dataHora,
    pessoaJuridica: ehPessoaJuridica,

    // A aplicação resolve o nome do empreendimento para o id interno
    empreendimentoNome: v('Empreendimento'),
    unidadeNumero: unidade.numero,

    // Estruturado, para o gerador de documento
    documento: {
      tipo,
      dadosGerais,
      comprador,
      representante,
      conjuge,
      testemunhas,
      intermediadora,
      ...(blocosPorTipo[tipo] ?? { compraVenda }),
    },
  },
}];
