# A virada para produção

Enquanto é fase de teste, o `imobiliaria.db` fica **versionado** de propósito:
cada publicação restaura os dados de demonstração, o que ajuda a repetir teste
no plano gratuito, onde o disco é apagado a cada reinício.

Isso tem uma consequência que precisa ficar explícita:

> **Todo deploy sobrescreve os usuários e os dados de produção pelos do
> repositório.** Corretor cadastrado hoje some na próxima publicação.

Aceitável em teste. Inaceitável com cliente usando.

## Quando virar

No dia em que **alguém cadastrar uma venda de verdade**. Não antes, não depois.

## Os cinco passos

### 1. Contratar o disco

No serviço do Render:

- *Disks* → *Add Disk*, montado em `/var/data`, 1 GB já sobra
- Trocar o plano de **Free** para **$7 / month** (disco não existe no gratuito)

### 2. Apontar os dados para o disco

Acrescentar nas variáveis de ambiente:

```
DADOS_DIR=/var/data
```

O código já respeita isso (ver `caminhos.js`). Banco e documentos passam a
morar no disco, que é o único lugar que sobrevive a uma publicação.

### 3. Tirar o banco do versionamento

```bash
git rm --cached imobiliaria.db
echo "imobiliaria.db" >> .gitignore
git commit -m "Banco sai do versionamento: dados de produção não vão para o git"
git push
```

A partir daqui, publicar **não toca mais nos dados**.

### 4. Levar os dados que já existem

O disco começa vazio, então o sistema criaria um banco novo com os dados de
exemplo. Se houver algo em produção que precise sobreviver, copie o arquivo
para o disco antes — dá para fazer pelo shell do Render, que passa a existir
no plano pago.

Se não houver nada a salvar, pule: o sistema cria o banco sozinho, e o
administrador nasce a partir do `APP_SENHA`.

### 5. Trocar as senhas

O `admin` do repositório tem a senha que circulou durante o desenvolvimento.
Com o banco fora do git, crie os usuários de verdade:

- um administrador para cada uma das duas pessoas da De Marchi
- um corretor para cada corretor
- depois **desative o `admin`** genérico

## O que continua faltando depois disso

O disco protege contra reinício. **Não protege contra apagar sem querer**, nem
contra o serviço ser excluído. Backup continua sem dono — é decisão de alguém,
não do código.

## Por que não Postgres/Supabase

Vale registrar a comparação, porque a pergunta volta:

| | Disco + SQLite | Supabase (Postgres) |
|---|---|---|
| Mudança no código | nenhuma | reescrever todas as consultas |
| Esforço | minutos | dias, com risco |
| Custo | US$ 7/mês | grátis no início |
| Backup automático | não | sim |
| Resolve os documentos `.docx` | sim | **não** — precisaria de disco ou storage assim mesmo |

A última linha é a que decide: **o disco é necessário de qualquer forma**, porque
os contratos gerados são arquivos. Tendo disco, o SQLite não custa nada a mais.

Postgres passa a valer a pena se aparecer mais de uma instância do sistema, ou
se backup automático virar exigência formal. Hoje, não é o caso.
