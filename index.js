import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const app = express();
app.use(cors());

const PORT = 3000;
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

// Remplace ici par ton adresse de mint réelle
const TOKEN_MINT_ADDRESS = 'GjfLko2rBuuunQTBVo9M4BHT4kx2LQHd55p8b7QuZUau'; // ← Mets ici ton token SPL

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sert les fichiers frontend
app.use(express.static(path.join(__dirname, 'frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Route enrichie : holders + owner_wallet
app.get('/holders', async (req, res) => {
  try {
    const holdersRes = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [TOKEN_MINT_ADDRESS]
      })
    });

    const holders = (await holdersRes.json()).result.value;

    const enriched = await Promise.all(
      holders.map(async acc => {
        const infoRes = await fetch(SOLANA_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [acc.address, { encoding: 'jsonParsed' }]
          })
        });

        const info = await infoRes.json();
        const owner = info.result?.value?.data?.parsed?.info?.owner;

        return {
          token_account: acc.address,
          owner_wallet: owner || 'Inconnu',
          amount: acc.uiAmount
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur enrichissement holders' });
  }
});

// Route : solde d’un wallet
app.get('/balance/:wallet', async (req, res) => {
  const wallet = req.params.wallet;

  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallet,
          { mint: TOKEN_MINT_ADDRESS },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const data = await response.json();
    const balances = data.result.value.map(acc => acc.account.data.parsed.info.tokenAmount);
    res.json(balances);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur récupération solde' });
  }
});

// Route : Nombre de wallets actifs détenant le token
app.get('/active-wallets', async (req, res) => {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          {
            encoding: 'jsonParsed',
            filters: [
              {
                dataSize: 165
              },
              {
                memcmp: {
                  offset: 0,
                  bytes: TOKEN_MINT_ADDRESS
                }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    // Vérifie que data.result existe et est un tableau
    if (!data.result || !Array.isArray(data.result)) {
      return res.status(500).json({ error: 'Données invalides de Solana' });
    }

    const uniqueWallets = new Set();
    data.result.forEach(item => {
      const owner = item.account?.data?.parsed?.info?.owner;
      if (owner) uniqueWallets.add(owner);
    });

    res.json({ activeWallets: uniqueWallets.size });

  } catch (err) {
    console.error('Erreur dans /active-wallets', err);
    res.status(500).json({ error: 'Erreur récupération wallets actifs' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
