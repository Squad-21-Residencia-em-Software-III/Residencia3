const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/api/status', async (req, res) => {
  try {
    const resultado = await db.query('SELECT NOW()');
    res.json({
      status: 'API funcionando perfeitamente!',
      banco_conectado: true,
      horario_banco: resultado.rows[0].now,
    });
  } catch (erro) {
    console.error('Erro ao conectar ao banco:', erro);
    res.status(500).json({ status: 'Erro', banco_conectado: false, erro: erro.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});