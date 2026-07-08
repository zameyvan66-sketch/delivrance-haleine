const express = require('express');
const axios = require('axios');
const app = express();

// Permet de lire les données envoyées au format JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route d'accueil pour vérifier que le serveur tourne bien
app.get('/', (req, res) => {
    res.send('Serveur Délivrance Haleine opérationnel et prêt pour Monetbil !');
});

// ROUTE 1 : Initier un paiement Monetbil
app.post('/payer', async (req, res) => {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Téléphone et montant requis' });
    }

    try {
        // Envoi de la requête à l'API Monetbil
        const response = await axios.post('https://api.monetbil.com/payment/v1/placePayment', {
            service: process.env.MONETBIL_SERVICE_KEY, // Ta clé secrète configurée sur Vercel
            phonenumber: phone,
            amount: amount,
            notify_url: `https://${process.env.VERCEL_URL}/notification` // URL automatique de notification
        });

        res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('Erreur lors du paiement Monetbil:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Échec de l\'initialisation du paiement' });
    }
});

// ROUTE 2 : Recevoir la notification de Monetbil après le paiement du client
app.post('/notification', (req, res) => {
    const transactionData = req.body;

    console.log('Notification de paiement reçue de Monetbil :', transactionData);

    // Vérification du statut envoyé par Monetbil (généralement "SUCCESS")
    if (transactionData.status === 'SUCCESS') {
        console.log(`Paiement réussi pour le montant de ${transactionData.amount} XAF`);
        // TODO: Ici, tu mettras le code pour libérer le produit ou le service pour ton client
    } else {
        console.log('Le paiement a échoué ou a été annulé.');
    }

    // Très important : Répondre à Monetbil pour dire qu'on a bien reçu l'information
    res.status(200).send('OK');
});

// Configuration obligatoire pour que Vercel fasse tourner l'application sans plantage
module.exports = app;
