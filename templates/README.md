# Modelos de documento

Cópias padronizadas dos arquivos de `modelo-contratos/`. Os originais não foram
alterados. Estes aqui é que a aplicação usa para gerar os documentos.

Se um modelo precisar de ajuste de texto, edite **este** arquivo (é ele que vale)
e mantenha os placeholders com o nome exato da tabela abaixo.

## Regra dos placeholders

Formato `[BLOCO_CAMPO]`, sempre em maiúsculas com underscore. Um nome, um
significado — nenhum placeholder pode ser ambíguo dentro do documento.

## Vocabulário

### Comprador — vem do formulário

| Placeholder | Campo no formulário |
|---|---|
| `[COMPRADOR_NOME]` | Nome completo do comprador |
| `[COMPRADOR_CPF]` | CPF do comprador |
| `[COMPRADOR_NACIONALIDADE]` | Nacionalidade do comprador |
| `[COMPRADOR_ESTADO_CIVIL]` | Estado civil do comprador |
| `[COMPRADOR_PROFISSAO]` | Profissão do comprador |
| `[COMPRADOR_RG]` | RG do comprador |
| `[COMPRADOR_ORGAO_EMISSOR]` | Órgão emissor do RG do comprador |
| `[COMPRADOR_ENDERECO]` | Endereço completo + CEP |
| `[COMPRADOR_TELEFONE]` | Telefone com DDD |
| `[COMPRADOR_EMAIL]` | E-mail do comprador |

### Cônjuge — vem do formulário, só quando informado

`[CONJUGE_NOME]` · `[CONJUGE_CPF]` · `[CONJUGE_NACIONALIDADE]` ·
`[CONJUGE_PROFISSAO]` · `[CONJUGE_RG]` · `[CONJUGE_ORGAO_EMISSOR]`

O cônjuge não tem estado civil próprio no formulário — é o mesmo do comprador.

### Empreendimento — vem do banco, não do formulário

Cada empreendimento é uma SPE (sociedade própria, CNPJ próprio) e entra nos
contratos como VENDEDORA. Cadastrados na tela de Empreendimentos.

| Placeholder | Coluna em `empreendimentos` |
|---|---|
| `[EMPREENDIMENTO_NOME]` | `nome` |
| `[EMPREENDIMENTO_RAZAO_SOCIAL]` | `razaoSocial` |
| `[EMPREENDIMENTO_CNPJ]` | `cnpj` |
| `[EMPREENDIMENTO_ENDERECO]` | `endereco` |
| `[EMPREENDIMENTO_SOCIO_ADMIN]` | `socioAdmin` |
| `[EMPREENDIMENTO_EMAIL]` | `email` |

### Unidade, documento e testemunhas

| Placeholder | Origem |
|---|---|
| `[UNIDADE_NUMERO]` | Número da unidade (formulário) |
| `[UNIDADE_TIPO]` | Tipo da unidade (formulário) |
| `[DOC_DATA]` | Data do documento |
| `[DOC_DIA]` / `[DOC_MES]` / `[DOC_ANO]` | Data quebrada (usado só no SCP) |
| `[DATA_COMPROMISSO_COMPRA_VENDA]` | Data do compromisso (termo de empréstimo) |
| `[SCP_VALOR_ENTRADA]` | Valor da entrada (SCP) |
| `[TESTEMUNHA_1_NOME]` / `[TESTEMUNHA_2_NOME]` | Testemunhas 1 e 2 |

## Modelos disponíveis

| Arquivo | Tipo escolhido no formulário |
|---|---|
| `contrato-promessa-compra-venda.docx` | Contrato de Promessa de Compra e Venda |
| `anexo-promessa-compra-venda.docx` | Anexo ao Contrato de Promessa de Compra e Venda |
| `termo-anuencia-outorga-poderes.docx` | Termo de Anuência com Outorga de Poderes |
| `termo-ciencia-anuencia-emprestimo.docx` | Termo de Ciência e Anuência para Empréstimo |
| `termo-adesao-preliminar-scp.docx` | Termo de Adesão Preliminar SCP |

## Pendências conhecidas

- **Contrato de permuta de terreno** ainda não padronizado: tem `[PORCENTAGEM]`
  9× e `[a completar]` 4×, cada um com significado distinto, dentro de cláusulas
  jurídicas. Precisa de mapeamento manual validado.
- **Permuta de concreto e de materiais** não têm origem de dados: o formulário
  nunca coletou esses campos.
- **Tabela de parcelas** do contrato de compra e venda ainda tem valores de
  exemplo fixos (Sinal / Mensais / Chaves). Precisa ser gerada a partir das
  parcelas 1–5 do formulário.
- No contrato de compra e venda, o campo rotulado `CPF:` usava o placeholder
  `[CNPJ]` por engano do documento original. Mapeado para `[COMPRADOR_CPF]`.
  **Confirmar com o jurídico.**
- CPF das testemunhas segue como `XXXXXXX` fixo, preenchido à mão (decisão do projeto).
