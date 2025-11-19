const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = 3000;

// ---------------- MIDDLEWARES ----------------
app.use(cors());
app.use(express.json());

// ---------------- BANCO DE DADOS ----------------
const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err.stack);
        return;
    }
    console.log('Conectado ao MySQL como id ' + db.threadId);
});

// =============================================
// 🔵 CONFIGS MERCADO PAGO + WHATSAPP
// =============================================
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; 
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; 
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!MP_ACCESS_TOKEN || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log("\n❗ Faltando variáveis no .env:");
    console.log("MP_ACCESS_TOKEN=");
    console.log("WHATSAPP_TOKEN=");
    console.log("WHATSAPP_PHONE_ID=\n");
}

// =============================================
// 🔵 ROTA: GERAR QR CODE PIX (Mercado Pago)
// =============================================
app.post('/create-payment', async (req, res) => {
    try {
        const { amount, nome, telefone, email } = req.body;

        const payload = {
            transaction_amount: Number(amount),
            payment_method_id: "pix",
            payer: {
                email: email || "no-email@teste.com",
                first_name: nome || "Cliente"
            },
            metadata: {
                customer_phone: telefone
            }
        };

        const resp = await axios.post(
            "https://api.mercadopago.com/v1/payments",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const payment = resp.data;

        res.json({
            success: true,
            id: payment.id,
            qr: payment.point_of_interaction.transaction_data.qr_code,
            qrBase64: payment.point_of_interaction.transaction_data.qr_code_base64
        });

    } catch (err) {
        console.log("Erro Mercado Pago:", err.response?.data || err.message);
        res.status(500).json({ success: false, error: err.response?.data || err.message });
    }
});

// =============================================
// 🔵 WEBHOOK DO MERCADO PAGO (PIX APROVADO)
// =============================================
app.post('/webhook-mp', async (req, res) => {
    try {
        console.log("Webhook recebido:", req.body);

        if (!req.body.data?.id) return res.sendStatus(400);

        const paymentId = req.body.data.id;

        // Buscar pagamento no Mercado Pago
        const consulta = await axios.get(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            {
                headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
            }
        );

        const pagamento = consulta.data;

        // Se o PIX foi aprovado
        if (pagamento.status === "approved") {
            const telefone = pagamento.metadata?.customer_phone;

            if (telefone) {
                // limpar telefone e ajustar para formato internacional
                const numeroFinal = telefone.replace(/\D/g, "");
                const numeroFormatado = numeroFinal.startsWith("55")
                    ? numeroFinal
                    : "55" + numeroFinal;

                // Enviar WhatsApp
                await axios.post(
                    `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
                    {
                        messaging_product: "whatsapp",
                        to: numeroFormatado,
                        type: "text",
                        text: {
                            body: `🎉 Pagamento aprovado!\n\nPIX confirmado com sucesso.\nValor: R$ ${pagamento.transaction_amount}`
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                            "Content-Type": "application/json"
                        }
                    }
                );

                console.log("WhatsApp enviado para:", numeroFormatado);
            }
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("Erro webhook:", err.response?.data || err.message);
        res.sendStatus(500);
    }
});

// =============================================
// 🔵 ROTA DE CADASTRO
// =============================================
app.post('/cadastro', async (req, res) => {
    const { login, senha, email, nome, cpf, telefone } = req.body;

    const hash = await bcrypt.hash(senha, 10);

    const sql = 'INSERT INTO usuario (login, senha, email, nome, cpf, telefone) VALUES (?, ?, ?, ?, ?, ?)';

    db.query(sql, [login, hash, email, nome, cpf, telefone], (err, result) => {
        if (err) {
            if (err.errno === 1062) { 
                return res.status(409).json({ sucesso: false, mensagem: 'Login já existe.' });
            }
            console.error('Erro SQL:', err);
            return res.status(500).json({ sucesso: false, mensagem: 'Erro interno.' });
        }
        res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado!' });
    });
});

// =============================================
// 🔵 ROTA DE LOGIN
// =============================================
app.post('/login', (req, res) => {
    const { login, senha } = req.body;

    const sql = 'SELECT * FROM usuario WHERE login = ?';
    db.query(sql, [login], async (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
        }

        const usuario = results[0];
        const match = await bcrypt.compare(senha, usuario.senha);

        if (match) {
            res.json({ sucesso: true, mensagem: 'Login realizado com sucesso.' });
        } else {
            res.json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
        }
    });
});

// =============================================
// 🔵 INICIAR SERVIDOR
// =============================================
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});


// 🔵 ROTA: Novo pedido
app.post('/novo-pedido', (req, res) => {
    const { nome, telefone, rua, numero, cidade, estado, cep, valor } = req.body;

    const sql = `INSERT INTO pedidos 
        (nome, telefone, rua, numero, cidade, estado, cep, valor) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [nome, telefone, rua, numero, cidade, estado, cep, valor], (err, result) => {
        if (err) {
            console.error("Erro ao salvar pedido:", err);
            return res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar pedido.' });
        }
        res.json({ sucesso: true, id: result.insertId });
    });
});
