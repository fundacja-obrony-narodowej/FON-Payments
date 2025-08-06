// server.js
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fetch from 'node-fetch';

const PAYNOW_API_URL = "https://api.sandbox.paynow.pl/v3/payments";
const PAYNOW_API_KEY = process.env.PAYNOW_API_KEY;
const PAYNOW_SIG_KEY = process.env.PAYNOW_SIG_KEY;

const CONTINUE_URL = "https://www.fundacjaobronynarodowej.pl/wesprzyj-nas"; // User returns here after Paynow

const app = express();
app.use(cors());
app.use(express.json());

function computeSignature(payload, sigKey) {
  return crypto.createHmac('sha256', sigKey)
    .update(payload, 'utf8')
    .digest('base64');
}

app.post('/create-payment', async (req, res) => {
  try {
    const { name, email, amountPLN } = req.body;
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "A valid name is required" });
    }
    const amount = Math.round(Number(amountPLN) * 100);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const externalId = crypto.randomUUID();
    const paymentRequest = {
      amount: amount,
      externalId: externalId,
      description: "Darowizna na cele fundacji",
      buyer: {
        email: email,
        firstName: name
      },
      continueUrl: CONTINUE_URL
    };
    const payload = JSON.stringify(paymentRequest);

    const idempotencyKey = crypto.randomUUID();
    const signature = computeSignature(payload, PAYNOW_SIG_KEY);

    const response = await fetch(PAYNOW_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": PAYNOW_API_KEY,
        "Signature": signature,
        "Idempotency-Key": idempotencyKey
      },
      body: payload
    });
    const result = await response.json();

    if (response.status === 201 && result.redirectUrl) {
      return res.json({ redirectUrl: result.redirectUrl });
    } else {
      return res.status(400).json({ error: result.errors ? JSON.stringify(result.errors) : JSON.stringify(result) });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Błąd serwera" });
  }
});

app.get('/', (req, res) => res.send('Paynow backend is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
