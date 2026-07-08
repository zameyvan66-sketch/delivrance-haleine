const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clé de service Monetbil récupérée de tes variables d'environnement Vercel
const MONETBIL_SERVICE_KEY = process.env.MONETBIL_SERVICE_KEY;

// 1. ROUTE D'ACCUEIL : Affiche le questionnaire visuel (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. ROUTE DE PAIEMENT : Pour envoyer une demande de paiement à Monetbil
app.post('/payer', async (req, res) => {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: "Le numéro et le montant sont requis." });
    }

    try {
        const response = await axios.post('https://api.monetbil.com/widget/v2.1/' + MONETBIL_SERVICE_KEY, {
            amount: amount,
            currency: 'XAF',
            phone: phone,
            locale: 'fr',
            notify_url: `https://${req.headers.host}/notification`
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Erreur Monetbil:", error.message);
        res.status(500).json({ error: "Erreur lors de l'initialisation du paiement." });
    }
});

// 3. ROUTE DE NOTIFICATION : Appelée par Monetbil automatiquement après le paiement
app.post('/notification', (req, res) => {
    const data = req.body;
    console.log("Notification reçue de Monetbil :", data);

    // Si le statut est "SUCCESS", le client a payé avec succès
    if (data.status === 'SUCCESS') {
        console.log(`Paiement réussi pour la transaction ${data.transaction_id}`);
        // C'est ici qu'on débloquera les résultats du questionnaire plus tard
    }

    // On répond TOUJOURS à Monetbil pour lui dire qu'on a bien reçu son message
    res.status(200).send('OK');
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur en ligne sur le port ${PORT}`);
});
