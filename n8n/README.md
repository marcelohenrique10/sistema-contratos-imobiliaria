# Integração n8n

O workflow `formulario-contratual-de-marchi.json` é a versão versionada do fluxo.
Sempre que ele mudar no n8n, exporte de novo por cima deste arquivo.

## Como o fluxo funciona

```
Google Form → planilha de respostas → n8n (polling 1 min, "rowAdded")
  → Extrair Campos
  → POST /webhook/cliente     (cria o cliente, vincula a unidade)
  → POST /webhook/contrato    (cria o contrato)
  → POST /webhook/documento   (gera o .docx a partir do modelo)
  → Gmail                     (avisa, com link do arquivo)
```

O n8n é intencionalmente "burro": ele não resolve ids nem escolhe modelo de
documento. Ele lê a resposta do formulário e repassa. Quem decide é a aplicação.
Isso é o que torna a migração entre contas n8n barata.

## Configuração ao importar (inclusive na conta do cliente)

### 1. Variáveis

Os nós HTTP usam duas variáveis, em vez de URL e token escritos no nó:

| Variável | Exemplo | O que é |
|---|---|---|
| `APP_BASE_URL` | `https://sistema.cliente.com.br` | URL pública da aplicação, sem barra no final |
| `APP_WEBHOOK_SECRET` | *(o mesmo valor do `.env` da aplicação)* | Precisa ser idêntico dos dois lados |

Ficam em **Settings → Variables** no n8n.

> Variáveis são recurso de plano pago. Se não aparecer a opção, substitua
> `{{ $vars.APP_BASE_URL }}` e `{{ $vars.APP_WEBHOOK_SECRET }}` direto nos dois nós
> HTTP ("Criar Cliente" e "Criar contrato").

### 2. Credenciais

Reconectar na conta destino, porque credencial não viaja no export:

- **Google Sheets Trigger OAuth2** — planilha de respostas do formulário
- **Gmail OAuth2** — envio da notificação

### 3. Pendências conhecidas no fluxo

- O nó **Enviar Email** está com `SUBSTITUIR_EMAIL_DESTINO`. Trocar pelo destinatário real.
- O formulário **não pergunta qual empreendimento**. Enquanto não existir essa
  pergunta, o valor sai da constante `EMPREENDIMENTO_PADRAO`, no topo do nó
  "Extrair Campos". Com mais de um empreendimento ativo, isso vira pergunta no formulário.
- O workflow é importado como inativo. Publicar só depois de testar.

## Contrato dos endpoints

Todos exigem `Authorization: Bearer <APP_WEBHOOK_SECRET>`.

### `POST /webhook/cliente`

```json
{
  "nome": "Carlos Andrade",
  "cpfCnpj": "111.222.333-44",
  "telefone": "(27) 99999-0000",
  "email": "carlos@email.com",
  "tipo": "Comprador",
  "observacoes": "texto livre",
  "empreendimentoId": "high-tower",
  "unidadeNumero": "1002"
}
```

Resposta: `{ "sucesso": true, "id": 5, "unidadeId": 3, "jaExistia": false }`

A aplicação resolve `unidadeNumero` + `empreendimentoId` para o id real da
unidade, e marca essa unidade como "negociacao" vinculada ao cliente.

Reenviar a mesma resposta **não duplica** o cliente: quando o `cpfCnpj` já
existe, o id existente é devolvido com `jaExistia: true`.

### `POST /webhook/contrato`

```json
{
  "clienteId": 5,
  "nome": "Contrato de Promessa de Compra e Venda - Carlos Andrade",
  "categoria": "Contrato de Promessa de Compra e Venda",
  "empreendimentoId": "high-tower",
  "unidadeNumero": "1002"
}
```

O prefixo numérico da lista suspensa do formulário (`"1. "`) é removido pela
aplicação, então mandar com ou sem prefixo dá no mesmo.

### `POST /webhook/documento`

Gera o arquivo. Recebe o objeto `documento` inteiro, do jeito que o nó
"Extrair Campos" monta:

```json
{
  "empreendimentoId": "high-tower",
  "unidadeNumero": "1002",
  "clienteId": 5,
  "contratoId": "wh-123456",
  "documento": {
    "tipo": "Contrato de Promessa de Compra e Venda",
    "dadosGerais": { "dataDocumento": "05/08/2026" },
    "comprador": { "nome": "...", "cpf": "..." },
    "conjuge": { "nome": "..." },
    "testemunhas": [{ "nome": "..." }],
    "compraVenda": { "parcelas": [] }
  }
}
```

Resposta:

```json
{
  "sucesso": true,
  "id": 4,
  "arquivo": "/storage/documentos/high-tower/contratos/contrato-....docx",
  "camposSemValor": ["EMPREENDIMENTO_SOCIO_ADMIN"]
}
```

`camposSemValor` lista os placeholders que ficaram em branco — serve para o
operador saber o que ainda precisa preencher à mão. Vai junto no e-mail.

Se `contratoId` for informado, o contrato correspondente passa para "gerado".

Tipos sem modelo cadastrado (hoje, o Contrato de Permuta) devolvem erro
explicando qual tipo faltou, em vez de gerar arquivo errado.

### Outros

- `POST /webhook/financeiro` — lançamento de entrada/saída
- `POST /webhook/unidade-status` — muda status da unidade
- `GET  /webhook/logs` — últimos 50 eventos recebidos, para auditoria

## Como testar sem esperar o formulário

```bash
curl -X POST "$APP_BASE_URL/webhook/cliente" \
  -H "Authorization: Bearer $APP_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","cpfCnpj":"000.000.000-00","empreendimentoId":"high-tower","unidadeNumero":"1002"}'
```

Depois confira em `GET /webhook/logs` e na tela de Espelho de vendas.
