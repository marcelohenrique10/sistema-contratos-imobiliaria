# Formulário Contratual

`apps-script-formulario.gs` gera o formulário completo do zero, via Google Apps Script.

## Por que Apps Script

Editar formulário clicando na interface é lento e frágil — uma pergunta fora de
ordem quebra a extração do n8n, que procura pelo **texto exato** do título.
O script é preciso e repetível: se algo sair errado, ajusta e roda de novo.

## Como rodar

1. `script.google.com` → Novo projeto
2. Cole o conteúdo de `apps-script-formulario.gs`
3. Selecione `criarFormularioContratual` → Executar
4. Autorize (é sua conta criando um formulário seu)
5. `Ctrl+Enter` mostra os links de edição e de resposta

O formulário atual **não é tocado**. Este cria um novo, em paralelo.

Depois: no formulário, aba **Respostas** → vincular a uma planilha. Só então
aponte o gatilho do n8n para essa planilha nova.

Para conferir que nada ficou repetido, rode `verificarTitulosDuplicados` passando
a URL de edição.

## Estrutura e ramificações

```
1. Dados gerais ─ empreendimento, unidade, data, cidade, responsável
2. Contratante ─┬─ 3. Pessoa física ─┬─ 5. Cônjuge ─┐
                │                    └──────────────┤
                └─ 4. Pessoa jurídica ──────────────┤
                                                    ↓
6. Unidade + "Qual documento?" ─┬─ Compra e Venda → 7. Preço ─┬─ à vista ────┐
                                │                             └─ 8. Parcelas ┤
                                ├─ Anexo / Anuência ────────────────────────┤
                                ├─ Empréstimo → 9. Dados do empréstimo ─────┤
                                └─ SCP → 10. Dados da SCP ──────────────────┤
                                                                            ↓
11. Intermediação ─┬─ sim → 12. Dados da intermediadora ─┐
                   └─ não ────────────────────────────────┤
                                                          ↓
                                    13. Testemunhas → 14. Observações → fim
```

## Regra dos títulos

**Todo título de pergunta é único.** Títulos repetidos viram colunas com o
mesmo cabeçalho na planilha, e o n8n perde dado. Por isso, por exemplo:

- `CNPJ da Pessoa Jurídica` (empréstimo) e `CNPJ do empreendimento` (SCP)
- `CEP do comprador`, `CEP do contratante PJ`, `CEP da Pessoa Jurídica`, `CEP da empresa`

Os títulos são o contrato com o nó "Extrair Campos" do n8n. Mudar aqui exige mudar lá.

## O que entrou de novo

Atende ao que foi definido na reunião com o cliente (`REP.md`) e aos comentários
que a Luana deixou nos modelos:

| Novidade | Origem |
|---|---|
| **Empreendimento** como pergunta | Reunião: "escolha feita diretamente no formulário" |
| Pessoa física **ou jurídica**, com representante legal | Reunião: "emissão tanto para CPF quanto CNPJ" |
| Cônjuge condicional | Reunião + comentário da Luana |
| À vista **ou** parcelado, com índice só no parcelado | Reunião: "INCC aplicável apenas em compras parceladas" |
| Intermediadora condicional | Comentário da Luana: "só vai ter caso tenha uma Construtora" |
| Observação especial | Comentário da Luana: "Alcides pediu esse espaço" |
| Áreas, fração ideal, vagas, preço por extenso | Campos que saíam em branco no contrato |

## Pendências

- **Empreendimentos são fixos no script** (`var EMPREENDIMENTOS`). Ao cadastrar
  um empreendimento novo no sistema, acrescente ali e rode de novo.
- **Contrato de Permuta ficou de fora**: o modelo ainda não foi padronizado.
- **Alienação e Fluxo direto** (modalidades pedidas na reunião) ficaram de fora:
  os modelos de contrato não existem ainda.
