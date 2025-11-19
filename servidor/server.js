const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt'); // Necessário para criptografar/comparar senhas

const app = express();
const port = 3000;

// Configuração de middlewares
app.use(cors()); // Permite que o front-end (HTML) se comunique com o servidor
app.use(express.json()); // Permite que o servidor leia JSON enviado pelo front-end

// Configuração do Banco de Dados
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'P+rpr@smp09', // **SUA SENHA AQUI**
    database: 'db_pratica'
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err.stack);
        return;
    }
    console.log('Conectado ao MySQL como id ' + db.threadId);
});

// --- ROTA DE CADASTRO CORRIGIDA (Recebe 6 campos) ---
app.post('/cadastro', async (req, res) => {
    // 1. Receber TODOS os 6 campos do Front-end
    const { login, senha, email, nome, cpf, telefone } = req.body; 

    // 2. Criptografar a senha
    const saltRounds = 10;
    const hash = await bcrypt.hash(senha, saltRounds);

    // 3. Consulta SQL para inserir TODOS os 6 campos
    const sql = 'INSERT INTO usuario (login, senha, email, nome, cpf, telefone) VALUES (?, ?, ?, ?, ?, ?)';

    // 4. db.query com TODOS os 6 valores
    db.query(sql, [login, hash, email, nome, cpf, telefone], (err, result) => {
        if (err) {
            // Se o login já existir
            if (err.errno === 1062) { 
                return res.status(409).json({ sucesso: false, mensagem: 'Login já existe.' });
            }
            console.error('Erro de Inserção SQL:', err); 
            return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no servidor.' });
        }
        res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!' });
    });
});


// --- ROTA DE LOGIN (Para verificar se o usuário pode acessar) ---
app.post('/login', (req, res) => {
    const { login, senha } = req.body;

    // 1. Buscar o usuário no banco
    const sql = 'SELECT * FROM usuario WHERE login = ?';
    db.query(sql, [login], async (err, results) => {
        if (err) throw err;

        // Se o usuário não foi encontrado
        if (results.length === 0) {
            return res.json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
        }

        const usuario = results[0];
        
        // 2. Comparar a senha fornecida com o hash no DB
        const match = await bcrypt.compare(senha, usuario.senha);

        if (match) {
            // Sucesso no login
            res.json({ sucesso: true, mensagem: 'Login realizado com sucesso.' });
        } else {
            // Senha incorreta
            res.json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
        }
    });
});


app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});