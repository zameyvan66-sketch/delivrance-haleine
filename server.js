const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();
const path = require('path');
const i18n = require('i18n');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Configuration du systÃ¨me bilingue
i18n.configure({
  locales: ['fr', 'en'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'fr',
  cookie: 'lang',
  queryParameter: 'lang'
});

app.use(i18n.init);


// Configuration du systÃ¨me bilingue
i18n.configure({
  locales: ['fr', 'en'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'fr',
  cookie: 'lang',
  queryParameter: 'lang'
});

// Activation de i18n
app.use(i18n.init);

// Stockage temporaire en mémoire pour les sessions et statuts de paiement
const sessions = new Map();
const payments = new Map();

// Configuration CamPay (Récupérée depuis le fichier .env)
const CAMPAY_ENV = process.env.CAMPAY_ENV || 'sandbox'; 
const CAMPAY_BASE_URL = CAMPAY_ENV === 'production' 
    ? 'https://www.campay.net/api' 
    : 'https://demo.campay.net/api';

const CAMPAY_APP_USERNAME = process.env.CAMPAY_APP_USERNAME;
const CAMPAY_APP_PASSWORD = process.env.CAMPAY_APP_PASSWORD;

// Fonction utilitaire pour obtenir le token d'authentification CamPay
async function getCampayToken() {
    try {
        const response = await axios.post(`${CAMPAY_BASE_URL}/token/`, {
            username: CAMPAY_APP_USERNAME,
            password: CAMPAY_APP_PASSWORD
        });
        return response.data.token;
    } catch (error) {
        console.error("Erreur d'authentification CamPay:", error.response ? error.response.data : error.message);
        throw new Error("Impossible de s'authentifier auprès de CamPay.");
    }
}

// 1. Soumission du questionnaire
app.post('/api/quiz/submit', (req, res) => {
    const { answers } = req.body;
    if (!answers) return res.status(400).json({ error: "Données manquantes" });

    const sessionId = crypto.randomUUID();
    
    // Calcul des scores par sphère
    const gScore = (parseInt(answers.g1) || 0) + (parseInt(answers.g2) || 0) + (parseInt(answers.g3) || 0);
    const bScore = (parseInt(answers.b1) || 0) + (parseInt(answers.b2) || 0) + (parseInt(answers.b3) || 0);
    const oScore = (parseInt(answers.o1) || 0) + (parseInt(answers.o2) || 0) + (parseInt(answers.o3) || 0);

    // Détermination de la cause principale
    let causePrincipale = "Bucco-dentaire (Plaque, bactéries ou gencives)";
    let maxScore = bScore;
    let teaser = "Nos algorithmes détectent une activité bactérienne localisée principalement dans la cavité buccale.";

    if (gScore > maxScore) {
        causePrincipale = "Gastrique (Reflux, acidité ou digestion lente)";
        maxScore = gScore;
        teaser = "Vos réponses indiquent un fort indice de reflux gastrique remontant le long de l'œsophage.";
    }
    if (oScore > maxScore) {
        causePrincipale = "ORL (Caséum, amygdales cryptiques ou sinusite)";
        maxScore = oScore;
        teaser = "L'analyse montre une accumulation probable de micro-résidus au niveau des voies respiratoires supérieures.";
    }

    // Sauvegarde des scores pour cette session
    sessions.set(sessionId, { gScore, bScore, oScore, causePrincipale, unlocked: false });

    res.json({ sessionId, teaser });
});

// 2. Initialisation du Paiement Mobile Money (CamPay)
app.post('/api/payment/initiate', async (req, res) => {
    const { sessionId, formula, phone } = req.body;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: "Session introuvable" });
    }

    const amount = formula === 'elite' ? '15000' : '5000';
    
    try {
        const token = await getCampayToken();
        
        // Requête de débit CamPay (Déclenche le push USSD sur le téléphone)
        const paymentResponse = await axios.post(
            `${CAMPAY_BASE_URL}/collect/`,
            {
                amount: amount,
                currency: "XAF",
                from: phone,
                description: `Bilan Délivrance Haleine - Formule ${formula}`,
                external_reference: sessionId
            },
            {
                headers: { Authorization: `Token ${token}` }
            }
        );

        // On enregistre la référence de transaction retournée par CamPay
        payments.set(paymentResponse.data.reference, { sessionId, status: 'PENDING' });

        res.json({ reference: paymentResponse.data.reference });
    } catch (error) {
        console.error("Erreur initiation paiement:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Échec du traitement du paiement mobile." });
    }
});

// 3. Vérification du statut du paiement (Polling)
app.get('/api/payment/status/:reference', async (req, res) => {
    const { reference } = req.params;
    const payment = payments.get(reference);

    if (!payment) return res.status(404).json({ error: "Transaction introuvable" });

    try {
        const token = await getCampayToken();
        const statusResponse = await axios.get(`${CAMPAY_BASE_URL}/transaction/${reference}/`, {
            headers: { Authorization: `Token ${token}` }
        });

        const status = statusResponse.data.status; // SUCCESSFUL, FAILED, ou PENDING
        payment.status = status;

        if (status === 'SUCCESSFUL') {
            const session = sessions.get(payment.sessionId);
            if (session) session.unlocked = true; // Débloque l'accès au rapport complet
        }

        res.json({ status });
    } catch (error) {
        console.error("Erreur statut paiement:", error.message);
        res.json({ status: payment.status }); // Retourne le dernier statut connu en mémoire en cas de bug API
    }
});

// 4. Récupération du rapport clinique débloqué
app.get('/api/report/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) return res.status(404).json({ error: "Analyse introuvable" });
    if (!session.unlocked) return res.status(403).json({ error: "Paiement requis pour débloquer ce rapport" });

    // Génération du contenu dynamique HTML du rapport final
    const htmlReport = `
        <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl mb-4 font-bold text-center">
             Transaction validée avec succès. Rapport médical débloqué.
        </div>
        <p class="text-sm"><b>Origine identifiée :</b> ${session.causePrincipale}</p>
        <div class="mt-4 p-4 bg-slate-50 rounded-xl space-y-2 border">
            <h4 class="font-bold text-xs text-indigo-600 uppercase"> Scores Cliniques détaillés :</h4>
            <p class="text-xs">Sphère Buccale : ${session.bScore} points</p>
            <p class="text-xs">Sphère Gastrique : ${session.gScore} points</p>
            <p class="text-xs">Sphère ORL : ${session.oScore} points</p>
        </div>
        <div class="mt-4 space-y-2">
            <h4 class="font-bold text-sm text-slate-900"> Plan d'action recommandé :</h4>
            <p class="text-xs text-slate-600 leading-relaxed">
                Présentez ce bilan à votre praticien pour orienter les examens cliniques. Évitez l'automédication par bains de bouche alcoolisés qui altèrent le microbiote protecteur.
            </p>
        </div>
    `;

    res.json({ html: htmlReport });
});

// Lancement de l'application sur le port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
