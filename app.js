require('dotenv').config();
const express = require('express');
const path = require('path');
const pagesRouter = require('./routes/pages');
const webhookRouter = require('./routes/webhook');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const { exigirLogin } = require('./services/auth');
const caminhos = require('./caminhos');

const app = express();
const PORT = process.env.PORT || 3000;

// Atrás de proxy (hospedagem com HTTPS), para o cookie Secure funcionar
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// No Express 5, requisição sem corpo deixa req.body indefinido — e qualquer
// rota que leia um campo dele quebraria com erro 500. Garantimos um objeto.
app.use((req, _res, next) => {
  if (!req.body) req.body = {};
  next();
});

// CSS e imagens ficam abertos; todo o resto exige sessão.
app.use(express.static(path.join(__dirname, 'public')));

// Webhooks são para o n8n: autenticam por token, não por sessão.
app.use('/webhook', webhookRouter);

// Login e logout precisam ficar fora da proteção.
app.use('/', authRouter);

// Os documentos gerados contêm CPF, RG e endereço dos compradores.
// Nunca podem ser servidos sem sessão.
app.use('/storage', exigirLogin, express.static(caminhos.STORAGE));

// Gestão de usuários é do administrador — o próprio router exige o papel.
// Montado no caminho, e não em '/', senão o exigirAdmin dele barraria tudo.
app.use('/usuarios', exigirLogin, usuariosRouter);

app.use('/', exigirLogin, pagesRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  if (!process.env.SESSION_SECRET || !process.env.APP_SENHA) {
    console.warn('\n  ATENÇÃO: SESSION_SECRET e/ou APP_SENHA não definidos no .env.');
    console.warn('  O login não vai funcionar até que existam. Veja o .env.example.\n');
  }
});
